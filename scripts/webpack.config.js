const path = require('path')
const glob = require('glob')
const HtmlWebpackPlugin = require('html-webpack-plugin')
// const CopyWebpackPlugin = require('copy-webpack-plugin')
const HtmlWebpackHarddiskPlugin = require('html-webpack-harddisk-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const OptimizeCSSPlugin = require('optimize-css-assets-webpack-plugin')

const env = process.env.NODE_ENV || 'development'
const isDev = env === 'development'

// 获取入口文件
const entries = () => {
  // 通过 globa.sync 方法获取 src/entries/下的所有 .ts 文件
  const entriesFile = glob.sync(path.resolve(__dirname, '../src/entries/*.ts'))
  /**
   * 入口字典
   * {
   *    index: 'src/entries/index.ts',
   *    blog: 'src/entries/blog.ts'
   * }
   */
  const map = Object.create(null)
  // 遍历匹配到的文件列表
  for (let i = 0; i < entriesFile.length; i++) {
    const filePath = entriesFile[i]
    const match = filePath.match(/entries\/([a-zA-Z0-9-_]+)\.ts$/)
    // 将文件名作为 key， 存入map
    // 如： src/entries/index.ts , src/entries/blog.ts 将分别作为 index / blog 两个入口
    map[match[1]] = filePath
  }

  return map
}



// config
const config = {
  entry: entries(),
  mode: 'development',
  output: {
    path: path.resolve(__dirname, '../dist/'),
    filename: isDev ? 'js/[name].js' : 'static/js/[name].[hash:7].js',
    publicPath: '/'
  },
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: [".ts", ".tsx", ".js"]
  },
  module: {
    rules: [{
        test: /\.tsx?$/,
        include: [
          path.resolve(__dirname, '../src/assets'),
          path.resolve(__dirname, '../src/entries')
        ],
        use: [{
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, '../tsconfig.front.json')
          }
        }],
      },
      {
        test: /\.js$/,
        use: [{
          loader: 'babel-loader'
        }],
        exclude: /node_modules/
      },
      {
        test: /\.scss$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'postcss-loader',
          'sass-loader',
        ]
      },
      {
        test: /\.html$/,
        use: [
          {
            loader: 'html-loader'
          }
        ]
      },
      {
        test: /\.(jpg|jpeg|png|gif|svg)$/i,
        use: [{
          loader: 'url-loader',
          options: {
            limit: 8192,
            name: !isDev ? 'static/img/[name].[hash:7].[ext]' : 'img/[name].[ext]'
          }
        }]
      }
    ],
  },
  plugins: [
    // new CopyWebpackPlugin([
    //   {
    //     from: path.resolve(__dirname, '../static'),
    //     to: 'static',
    //     ignore: ['.*']
    //   }
    // ]),

    new MiniCssExtractPlugin({
      filename: !isDev ? 'static/css/[name].[hash:7].css' : 'css/[name].css',
      chunkFilename: !isDev ? 'static/css/[name].[hash:7].css' : 'css/[name].css'
    }),

    new OptimizeCSSPlugin({ safe: true, map: false, discardComments: { removeAll: true } }),
  ],

  // 提取公共模块
  optimization : {
    splitChunks: {
      cacheGroups: {
        commons: {
          name: 'app',
          chunks: 'all',
          minChunks: 2
        }
      }
    }
  }
}


// 以入口找模板
Object.keys(config.entry).forEach(entry => {
  config.plugins.push(new HtmlWebpackPlugin({
    filename: 'views/' + entry + '.html',
    template: path.resolve(__dirname, `../src/views/${entry}.html`),
    chunks: ['app', entry],
    alwaysWriteToDisk: true,
    minify: {
      removeComments: true,
      collapseWhitespace: true,
      removeAttributeQuotes: false,
      minifyCSS: true,
      minifyJS: true
    },
  }))
})


config.plugins.push(new HtmlWebpackHarddiskPlugin())

module.exports = config