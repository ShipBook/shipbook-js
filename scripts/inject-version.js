const fs = require('fs');
const path = require('path');

// Get package type from argument (undefined = core, 'client', 'browser', 'react-native', 'node')
const packageType = process.argv[2];
const rootDir = path.join(__dirname, '..');

let packageDir, varName;

if (!packageType) {
  // Core package
  packageDir = path.join(rootDir, 'packages', 'core');
  varName = 'CORE_VERSION';
} else if (packageType === 'client') {
  // Client package
  packageDir = path.join(rootDir, 'packages', 'client');
  varName = 'CLIENT_VERSION';
} else {
  // Platform package
  packageDir = path.join(rootDir, 'packages', packageType);
  varName = 'PLATFORM_VERSION';
}

const outputPath = path.join(packageDir, 'src', 'generated', 'version.ts');
const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
const version = packageJson.version;

// Ensure generated directory exists
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const content = `// AUTO-GENERATED - DO NOT EDIT
export const ${varName} = '${version}';
`;

fs.writeFileSync(outputPath, content);
console.log(`Injected ${varName}: ${version}`);
