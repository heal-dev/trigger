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
        it('should fail when both suite-id and suite are provided', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                return 'test-value';
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Please provide either suite-id or suite, not both.'));
        });

        it('should fail if invalid suite id and invalid suite are provided', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                return null;
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Please provide either suite-id or suite.'));
        });

        it('should fail in case of invalid suite format', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite') return 'invalid-suite-input';
                return null;
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid suite input. Please provide the suite in the format "project/suite".'));
        });

        it('should fail if suite-id provided with stories instead of payload', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite-id') return 'test-suite-id';
                if (name === 'stories') return 'some-story';
                return null;
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('When "suite-id" is provided, "stories" should come from "payload", not "stories" or "test-config".'));
        });

        it('should fail if suite provided with payload instead of stories', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite') return 'test-suite';
                if (name === 'payload') return '{}';
                return null;
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('When "suite" is provided, "stories" should come from "stories", not "payload".'));
        });
        it('should handle API errors gracefully', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite') return 'test/test-suite';
                return null;
            });
            global.fetch = jest.fn().mockRejectedValue(new Error('API Error'));

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('API Error'));
        });

        it('should handle invalid JSON payload', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'payload') return 'invalid-json';
                if (name === 'suite-id') return 'test-suite';
                return null;
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON payload'));
        });
        it('should fail if payload is not an array of stories', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite-id') return 'test-suite-id';
                if (name === 'payload') return JSON.stringify({ invalidKey: 'invalidValue' });
                return null;
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid payload: "stories" must be an array.'));
        });

        it('should fail if stories in payload have invalid structure', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite-id') return 'test-suite-id';
                if (name === 'payload') {
                    return JSON.stringify({
                        stories: [{ id: 'invalidId', entryHref: 123 }]
                    });
                }
                return null;
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('"id" must be a number'));
            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON payload: Invalid story: \"id\" must be a number. Found string.'));
        });

        it('should fail if stories is not an array', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite') return 'test/test-suite';
                if (name === 'stories') return JSON.stringify({ invalidKey: 'invalidValue' });
                return null;
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid stories: "stories" must be an array.'));
        });

        it('should fail if stories have invalid structure', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite') return 'test/test-suite';
                if (name === 'stories') {
                    return JSON.stringify([
                        {
                            slug: 123,
                            'test-config': { entrypoint: 456 }
                        }
                    ]);
                }
                return null;
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('"slug" must be a string'));
            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON payload: Invalid story: \"slug\" must be a string. Found number.'));
        });
        it('should execute the full workflow successfully, given a suite-id', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite-id') return 'test-suite-id';
                if (name === 'payload') {
                    return JSON.stringify({
                        stories: [
                            { id: 1, entryHref: 'http://example.com/story1' },
                            { id: 2, variables: { key: 'value' } }
                        ]
                    });
                }
                return null;
            });

            await run();

            expect(core.setOutput).toHaveBeenCalledWith('execution-id', 'test-execution');
            expect(core.setOutput).toHaveBeenCalledWith('execution-url', 'http://test.com/execution');
            expect(global.fetch).toHaveBeenCalledTimes(2); // One for trigger, one for status
        }, 20000);
        it('should execute the full workflow successfully - given a suite', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite') return 'test/test-suite';
                if (name === 'stories') {
                    return JSON.stringify([
                        {
                            slug: 'story1',
                            'test-config': {
                                entrypoint: 'http://example.com/entry1',
                                variables: { key: 'value' }
                            }
                        }
                    ]);
                }
                return null;
            });

            await run();

            expect(core.setOutput).toHaveBeenCalledWith('execution-id', 'test-execution');
            expect(core.setOutput).toHaveBeenCalledWith('execution-url', 'http://test.com/execution');
            expect(global.fetch).toHaveBeenCalledTimes(2); // One for trigger, one for status
        }, 20000);
        it('should fail if global "test-config" has an invalid "entrypoint"', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite') return 'test/test-suite';
                if (name === 'test-config') {
                    return JSON.stringify({
                        entrypoint: 123 // Invalid entrypoint
                    });
                }
                return null;
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('"entrypoint" must be a string if provided. Found number.'));
        });

        it('should fail if global "test-config" has an invalid "variables" type', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite') return 'test/test-suite';
                if (name === 'test-config') {
                    return JSON.stringify({
                        variables: 'invalid' // Invalid variables type
                    });
                }
                return null;
            });

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('"variables" must be an object if provided. Found string.'));
        });

        it('should execute successfully with valid global "test-config"', async () => {
            core.getInput = jest.fn().mockImplementation((name) => {
                if (name === 'suite') return 'test/test-suite';
                if (name === 'stories') {
                    return JSON.stringify([
                        {
                            slug: 'story1',
                            'test-config': { entrypoint: 'http://example.com/entry1' }
                        }
                    ]);
                }
                if (name === 'test-config') {
                    return JSON.stringify({
                        entrypoint: 'http://example.com/global-entry',
                        variables: { globalKey: 'globalValue' }
                    });
                }
                return null;
            });

            await run();

            expect(core.setOutput).toHaveBeenCalledWith('execution-id', 'test-execution');
            expect(core.setOutput).toHaveBeenCalledWith('execution-url', 'http://test.com/execution');
            expect(global.fetch).toHaveBeenCalledTimes(2); // One for trigger, one for status
        }, 20000);
    });


});
