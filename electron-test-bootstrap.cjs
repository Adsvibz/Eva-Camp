// Test launcher only; excluded from packaged applications.
const {app}=require('electron')
const path=require('node:path')
if(!process.env.EVA_TEST_DATA_DIR)throw new Error('An isolated test data directory is required')
app.setPath('userData',process.env.EVA_TEST_DATA_DIR)
app.setPath('sessionData',process.env.EVA_TEST_DATA_DIR)
require(path.join(__dirname,'out/main/main.cjs'))
