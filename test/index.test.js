const core = require('@actions/core');
const { context, getOctokit } = require('@actions/github');
const { run, createTestSummary, createPRComment, formatTestResults } = require('../index');

// Mock the modules
jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('node-fetch');

describe('GitHub Action Tests', () => {
    // Mock data
    const mockResults = {
        runs: [
            { id: '1', result: 'PASS', status: 'finished', link: 'http://test.com/1' },
            { id: '2', result: 'FAIL', status: 'finished', link: 'http://test.com/2' },
            { id: '3', result: 'CRASH', status: 'finished', link: 'http://test.com/3' }
        ],
        status: 'finished'
    };

    const mockUrl = 'http://test.com/suite/123';

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();

        // Setup core mock implementation
        core.summary = {
            addHeading: jest.fn().mockReturnThis(),
            addTable: jest.fn().mockReturnThis(),
            addRaw: jest.fn().mockReturnThis(),
            addLink: jest.fn().mockReturnThis(),
            addEOL: jest.fn().mockReturnThis(),
            write: jest.fn().mockResolvedValue(undefined)
        };
    });

    describe('createTestSummary', () => {
        it('should create a test summary with all types of results', async () => {
            await createTestSummary(mockResults, mockUrl);

            // Verify summary creation
            expect(core.summary.addHeading).toHaveBeenCalledWith('🧪 Heal Test Results', 2);
            expect(core.summary.addTable).toHaveBeenCalledWith([
                [
                    { data: 'Total Tests', header: true },
                    { data: 'Passed', header: true },
                    { data: 'Failed', header: true },
                    { data: 'Agent Needs More Input', header: true }
                ],
                ['3', '1', '1', '1']
            ]);
            expect(core.summary.write).toHaveBeenCalled();
        });
    });

    describe('createPRComment', () => {
        it('should create a PR comment when token and PR context exist', async () => {
            const mockCreateComment = jest.fn();
            getOctokit.mockReturnValue({
                rest: {
                    issues: {
                        createComment: mockCreateComment
                    }
                }
            });

            context.payload = {
                pull_request: { number: 123 }
            };
            context.repo = {
                owner: 'testOwner',
                repo: 'testRepo'
            };

            await createPRComment('mock-token', 'Test comment');

            expect(getOctokit).toHaveBeenCalledWith('mock-token');
            expect(mockCreateComment).toHaveBeenCalledWith({
                owner: 'testOwner',
                repo: 'testRepo',
                issue_number: 123,
                body: 'Test comment'
            });
        });

        it('should not create a PR comment when token is missing', async () => {
            core.info = jest.fn();
            await createPRComment(null, 'Test comment');
            expect(core.info).toHaveBeenCalledWith('No github token provided');
            expect(getOctokit).not.toHaveBeenCalled();
        });
    });

    describe('formatTestResults', () => {
        it('should format test results correctly', () => {
            const formattedResults = formatTestResults(mockResults, mockUrl);

            expect(formattedResults).toContain('## 🧪 Heal Test Results');
            expect(formattedResults).toContain('### Summary');
            expect(formattedResults).toContain('**Total Tests**: 3');
            expect(formattedResults).toContain('✅ 1');
            expect(formattedResults).toContain('🔴 1');
            expect(formattedResults).toContain('🟡 1');
            expect(formattedResults).toContain('### Failed Tests');
            expect(formattedResults).toContain('### Agent Needs More Input Tests');
        });
    });

    describe('run', () => {
        beforeEach(() => {
            // Mock core.getInput for different inputs
            core.getInput = jest.fn().mockImplementation((name) => {
                const inputs = {
                    'api-token': 'test-token',
                    'suite-id': 'test-suite',
                    'payload': '{}',
                    'wait-for-results': 'yes',
                    'domain': 'https://api.test.com',
                    'comment-on-pr': 'yes',
                    'github-token': 'github-token'
                };
                return inputs[name];
            });

            // Mock fetch globally
            global.fetch = jest.fn().mockImplementation((url) => {
                if (url.includes('/trigger')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            executionId: 'test-execution',
                            url: 'http://test.com/execution'
                        })
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockResults)
                });
            });
        });

        it('should execute the full workflow successfully', async () => {
            await run();

            expect(core.setOutput).toHaveBeenCalledWith('execution-id', 'test-execution');
            expect(core.setOutput).toHaveBeenCalledWith('execution-url', 'http://test.com/execution');
            expect(global.fetch).toHaveBeenCalledTimes(2); // One for trigger, one for status
        }, 10000);

        it('should handle API errors gracefully', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('API Error'));

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('API Error'));
        });

        it('should handle invalid JSON payload', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite-id') return 'test-suite';
                if (name === 'configuration') return null;
                if (name === 'payload') return 'invalid-json';
                return 'test-value';
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON payload'));
        });
        it('should throw an error when both "suite-id" nor "configuration" is provided', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite-id') return 'test-suite';
                if (name === 'configuration') return 'suite: project/test';
                return 'test-value';
            });

            await expect(run()).rejects.toThrow(
                'Provide either "suite-id" or "configuration", but not both.'
            );
        });
        it('should throw an error when neither "suite-id" nor "configuration" is provided', async () => {
            core.getInput.mockImplementation(() => null);

            await expect(run()).rejects.toThrow(
                'You must provide either "suite-id" or "configuration".'
            );
        });

        it('should parse YAML configuration and trigger execution', async () => {
            core.getInput.mockImplementation(name => {
                if (name === 'configuration') return 'suite: project/test';
                if (name === 'suite-id') return null;
                return 'test-value';
            });

            fetch.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ executionId: 'abc123', url: mockUrl }),
            });

            await run();

            expect(core.info).toHaveBeenCalledWith('Triggering suite execution at https://api.heal.dev/api/projects/project/suites/test/trigger...');
            expect(core.setOutput).toHaveBeenCalledWith('execution-id', 'abc123');
            expect(core.setOutput).toHaveBeenCalledWith('execution-url', mockUrl);
        }, 30000);

        it('should handle trigger API failure', async () => {
            core.getInput.mockImplementation(name => (name === 'suite-id' ? '123' : null));

            fetch.mockResolvedValueOnce({ ok: false, status: 500 });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith('Action failed with error: HTTP error! status: 500');
        });

    });
});
