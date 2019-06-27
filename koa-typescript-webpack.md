111

<hr class="page-break" hidden/>


### 目录结构
``` text
.
├── .babelrc
├── bin
│   ├── dev.server.ts
│   ├── pm2.json
│   └── prod.server.ts
├── config                                       # 配置目录
│   ├── dev.ts
│   └── prod.ts
├── nodemon.json
├── package.json
├── postcss.config.js
├── scripts
│   └── webpack.config.js
├── src                                          # 源码
│   ├── assets                                   # 静态资源
│   │   ├── imgs
│   │   ├── scss
│   │   └── ts
│   ├── entries                                  # webpack入口
│   │   ├── blog.ts
│   │   └── index.ts
│   ├── server                                   # 服务端
│   │   ├── app.ts
│   │   └── middleware
│   │       └── webpack-dev-middleware.ts
│   └── views                                    # 模板（文件名与入口一一对应）
│       ├── blog.html
│       ├── index.html
│       └── layout                               # 模板布局
│           ├── footer.html
│           └── header.html
├── test                                         # 单元测试
│   └── .gitkeep                                      
├── tsconfig.front.json
└── tsconfig.json
```

### 开发环境(development)流程

![开发环境流程图](https://img.smohan.net/a24ad158091d478128182068f4c4a1ad.svg)

`ts-node`启动项目后，整个流程分为两部分，蓝色线条的代表纯服务端代码的编译过程。服务端代码是纯`typeScript`文件，可以通过`ts-node`直接编译运行。前端代码包含了`ejs`渲染所需要的模板文件(html)，以及模板中所引用的静态资源(ts, scss, img)，这部分需要通过webpack来编译。

```typescript
// path: bin/dev.server.ts
import webpack = require('webpack')
// 引入项目主模块
import app from '../src/server/app'
// webpack-dev-middleware中间件
import devMiddleware from '../src/server/middleware/webpack-dev-middleware'
// webpack配置文件
const webpackConfig = require('../scripts/webpack.config.js')

// https://webpack.docschina.org/api/compiler
const compiler = webpack(webpackConfig)

app.use(devMiddleware(compiler, {
  // 很重要，提供了静态资源的路径, 该路径与webpackConfig中的output.publicPath 对应
  publicPath: '/' 
}))

const PORT: number = Number(process.env.PORT) || 3000
app.listen(PORT) 
```

- 项目运行时通过 `webpack-dev-middleware` 中间件来调用webpack，以便 `ctx.render` 时渲染的就是**编译后**的模板文件；
- 通过`glob`模块来遍历`src/entries/*.ts`下的入口文件，生成webpack的`entry`配置项`config.entry`；这也是**Webpack多页面配置**必不可少的一步；
- 通过`ts-loader/babel-loader`等来编译入口文件以及入口文件中所引用的`ts/js`模块；
- 通过`css-loader/sass-loader`等来编译入口文件中所引用的`scss/css`模块，并且直接通过`MiniCssExtractPlugin.loader`来独立生成css文件；
- 通过`url-loader`等来编译引用的资源文件，如image；
- 遍历`config.entry`来查找对应的模板文件，生成多页面的`HtmlWebpackPlugin`配置；

> 通过`webpack-dev-middleware`编译后的文件都在**内存中**， 但是`ejs`渲染所需要的模板文件都必须为真实的物理文件。因此需要有两个`output`，一个将静态资源放置在内存中，一个则直接编译后生成物理文件放置在`dist/views`中（方案见[ejs模板文件无法使用内存文件的解决方法]章节）。

#### 实现Koa webpack-dev-middleware中间件

> [webpack-dev-middleware](https://webpack.docschina.org/guides/development/#%E4%BD%BF%E7%94%A8-webpack-dev-middleware) 是一个封装器(wrapper)，它可以把 webpack 处理过的文件发送到一个 server。

webpack-dev-middleware是一个标准的express中间件，其一个重要作用就是将经过webpack编译打包的文件生成在内存中，以便下一个中间件使用。很多Cli使用的`webpack-dev-server`就是基于`express＋webpack-dev-middleware`的实现。

由于webpack-dev-middleware是一个标准的express中间件，在Koa中不能直接使用它，因此需要将webpack-dev-middleware封装一下，以便Koa能够直接使用。

##### 安装依赖

```bash
npm i -D webpack-dev-middleware @types/webpack-dev-middleware
```
##### koa-webpack-dev-middleware

```typescript
// path: src/server/middleware/webpack-dev-middleware.ts
// opts 配置同 webpack-dev-middleware

import * as WebpackDevMiddleware from 'webpack-dev-middleware'
import * as Koa from 'koa'
import { NextHandleFunction } from 'connect'
import webpack = require('webpack')

const devMiddleware = (compiler: webpack.ICompiler, opts: WebpackDevMiddleware.Options) => {
  const middleware = WebpackDevMiddleware(compiler, opts)
  return async (ctx: Koa.Context, next: NextHandleFunction) => {
    await middleware(ctx.req, {
      // @ts-ignore
      end: (content:string) => {
        ctx.body = content
      },
      setHeader: (name, value: any) => {
        ctx.set(name, value)
      }
    }, next)
  }
}

export default devMiddleware 
```

#### glob遍历目录生成webpack入口

webpack 要实现一个多页面的配置，需要配置多个入口。随着深入的开发，入口往往是动态不定的，因此要实现一个动态获取入口的方法。

[glob](https://www.npmjs.com/package/glob)是一个允许正则匹配文件路径的模块，借助glob模块，很容易遍历某个目录下的所有文件来生成一个入口的map。

```javascript
// path: scripts/webpack.config.js
// ...

// 获取入口文件
const entries = () => {
  // 通过 globa.sync 方法获取 src/entries/下的所有 .ts 文件
  const entriesFile = glob.sync(path.resolve(__dirname, '../src/entries/*.ts'))
  /**
   * 入口字典
   * {
   *    index: 'src/entries/index.ts',
   *    blog: 'src/entries/blog.ts',
   *    // ...
   * }
   */
  const map = Object.create(null)
  // 遍历匹配到的文件列表
  for (let i = 0; i < entriesFile.length; i++) {
    const filePath = entriesFile[i]
    // 提取文件名
    const match = filePath.match(/entries\/([a-zA-Z0-9-_]+)\.ts$/)
    // 将文件名作为 key， 存入map
    // 如： src/entries/index.ts , src/entries/blog.ts 将分别作为 index / blog 两个入口
    map[match[1]] = filePath
  }

  return map
}

// webpack config
const webpackConfig = {
  entry: entries(),
  // ...
}

module.exports = webpackConfig
```

#### 入口文件映射模板文件
由于前端源码使用的typescript/es6/scss，这些文件必须经过编译后才能被浏览器识别。同时，对资源文件的版本处理（加版本号），也需要借助`HtmlWebpackPlugin`这个插件注入到对应模板上。就像流程图中示意的那样，当访问路由时（如 localhost:3000/blog），ejs 加载的并不是 `src/views` 下的模板，**而是编译后（此时 css/js的引用已经注入到页面中）的位于 `dist/views`下的新的模板文件**。多入口对应多个模板，每个模板文件和入口文件应该有个映射关系，这个关系可以通过维护一个map来实现（不利于增改），也可以通过文件命名规则来实现。这里采用命名规则来实现，这样更有利于自动化。

```javascript
// path: scripts/webpack.config.js
// ...

// 遍历webpackConfig入口, key 对应了模板的文件名，这个命名规则可以更复杂些，比如增加对子目录的支持
// {
//   index: 'views/index.html',
//   blog: 'views/blog.html'
// }

const isProduction = process.env.NODE_ENV === 'production'

Object.keys(webpackConfig.entry).forEach(entry => {
  // 在 plugins 配置中增加了多个 HtmlWebpackPlugin 实例
  webpackConfig.plugins.push(new HtmlWebpackPlugin({
    filename: 'views/' + entry + '.html',
    template: path.resolve(__dirname, `../src/views/${entry}.html`),
    chunks: [entry],  // 将入口文件打包后的文件注入到对应的页面中
    alwaysWriteToDisk: true,  // 该配置项说明见 [ejs模板文件无法使用内存文件的解决方法] 章节
    minify: {
      removeComments: isProduction,
      collapseWhitespace: isProduction,
      removeAttributeQuotes: false,
      minifyCSS: isProduction,
      minifyJS: isProduction
    },
  }))
})

```

#### ejs模板文件无法使用内存文件的解决方法

webpack-dev-middleware 的一个重要特性就是生成的文件都位于内存中，是一个内存型的文件系统。而`koa-ejs`作为渲染引擎只能加载真实的物理文件，当它加载 `dist/vies/*.html`时会报文件未找到的错。因此，对模板文件的编译就不能再像其他资源一样生成于内存中，而是要把模板文件真真切切的生成为文件。[HtmlWebpackHarddiskPlugin](https://github.com/jantimon/html-webpack-harddisk-plugin) 这个webpack插件可以完美解决。
```bash
npm i -D html-webpack-harddisk-plugin
```
```javascript
// path: scripts/webpack.config.js
// ...
const HtmlWebpackHarddiskPlugin = require('html-webpack-harddisk-plugin')
// ... 见 [入口文件映射模板文件] 章节
webpackConfig.plugins.push(new HtmlWebpackPlugin({
  // 增加该配置项
  alwaysWriteToDisk: true, 
}))
// ...

// 应用 HtmlWebpackHarddiskPlugin 插件
webpackConfig.plugins.push(new HtmlWebpackHarddiskPlugin())
```

#### 前后端typescript配置文件的冲突

Server端和前端可能在typescript的配置上有所不同，尤其是在一些[编译选项](https://www.tslang.cn/docs/handbook/compiler-options.html)上。此时需要两个不同的配置文件。`tsconfig.json`是默认的TypeScript配置文件, 这里就作为Server端的配置项，根目录新建 `tsconfig.front.json` 作为前端的配置文件：

```json
// ./tsconfig.front.json
{
  "compilerOptions": {
    "outDir": "./dist/",
    "noImplicitAny": true,
    "module": "es6",
    "target": "es5",
    "jsx": "react",
    "allowJs": true
  },
  "include":[
    "src/assets/**/*",
    "src/entries/**/*"
  ],
  "exclude": [
    "node_modules"
  ]
}
```
同时，需要在webpack配置文件中指定配置文件路径：
```javascript
// path: scripts/webpack.config.js
// ...
 webpackConfig.module = {
    rules: [{
        test: /\.tsx?$/,
        include: [
          path.resolve(__dirname, '../src/')
        ],
        use: [{
          loader: 'ts-loader',
          options: {
            // 指定配置文件
            configFile: '../tsconfig.front.json'
          }
        }],
      },
      // ...
    ],
  },
// ...
```

至此，基于基于WEBPACK/TYPESCRIPT/KOA的前后端多页面开发环境配置完毕。配置[nodemon](https://github.com/remy/nodemon), nodemon将监视启动目录中的文件，如果有任何文件更改，nodemon将自动重新启动node应用程序。

> 运行 `npm start`, 实际上是运行 `nodemon`, nodemon将根据`nodemon.json`配置项来启动`npm run dev`命名。当src目录下的文件有任何变化时，它将重启应用程序。

```json
// ./nodemon.json
{
  "watch": ["src"],
  "exec": "npm run dev",
  "ext": "ts"
}
```
在`package.json`的`scripts`中加入运行脚本方便一键启动。

```json
// ./package.json
{
  "scripts": {
    "start": "nodemon",
    "dev": "rm -rf dist && cross-env NODE_ENV=development ts-node bin/dev.server.ts",
  }
}
```

### 生成环境(production)流程



### 完整webpack配置

[webpack.config.js](https://github.com/S-mohan/koa-webpack-typescript/blob/master/scripts/webpack.config.js)

### 项目地址

[GitHub地址](https://github.com/S-mohan/koa-webpack-typescript)