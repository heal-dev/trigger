import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const buildAction = async () => {
  try {
    await build({
      entryPoints: [join(__dirname, 'src', 'index.js')],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm', 
      outfile: join(__dirname, 'dist', 'index.js'),
      sourcemap: true,
      minify: true,
      banner: {
        js: `
          export const require = (await import("node:module")).createRequire(import.meta.url);
          export const __filename = '${__filename}';
          export const __dirname = '${__dirname}';
        `,
      },
    });
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
};

// Run the build process
buildAction();
