const fs = require('fs');
const path = require('path');

const version = require('../package.json').version;
const versionFilePath = path.join(__dirname, '..', 'electron', 'public', 'version.json');

const versionObject = {
  version: version,
};

// generate version file
function generateVersionFile() {
  fs.writeFileSync(versionFilePath, JSON.stringify(versionObject), 'utf8');
  console.log(`Version file generated at ${versionFilePath}`);
}

generateVersionFile();