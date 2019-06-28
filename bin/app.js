const app = require('../dist/server/app')
const path = require('path')
app.proxy = true
app.use(require('koa-static')(path.resolve(__dirname, '../dist')))

app.listen(8080)