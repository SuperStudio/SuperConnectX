const fs = require('fs')
const path = require('path')

module.exports = async function (context) {
  const sandbox = path.join(context.appOutDir, 'chrome-sandbox')
  if (fs.existsSync(sandbox)) {
    fs.chmodSync(sandbox, 0o4755)
    console.log('afterPack: chrome-sandbox permissions set to 4755')
  }
}
