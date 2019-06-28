const webpack = require('webpack')
// 引入项目主模块
const app = require('../server/app')
// webpack-dev-middleware中间件
import devMiddleware from '../server/middleware/webpack-dev-middleware'
// webpack配置文件
const webpackConfig = require('../scripts/webpack.config.js')

// https://webpack.docschina.org/api/compiler
const compiler = webpack(webpackConfig)

app.use(devMiddleware(compiler, {
  publicPath: '/' // 很重要，提供了静态资源的路径
}))

const PORT: number = Number(process.env.PORT) || 3000

app.listen(PORT)

export default app