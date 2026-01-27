const fs = require('fs');
const path = require('path');

// Get package type from argument (undefined = core, 'browser', 'react-native')
const packageType = process.argv[2];

let packageDir, outputPath, varName;

if (!packageType) {
  // Core package
  packageDir = path.join(__dirname, '..');
  outputPath = path.join(packageDir, 'src', 'generated', 'version.ts');
  varName = 'SDK_VERSION';
} else {
  // Platform package
  packageDir = path.join(__dirname, '..', '..', packageType);
  outputPath = path.join(packageDir, 'src', 'generated', 'version.ts');
  varName = 'SDK_PLATFORM_VERSION';
}

const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
const version = packageJson.version;

// Ensure generated directory exists
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const content = `// AUTO-GENERATED - DO NOT EDIT
export const ${varName} = '${version}';
`;

fs.writeFileSync(outputPath, content);
console.log(`Injected ${varName}: ${version}`);
