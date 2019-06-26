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
// bin/dev.server.ts
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
  publicPath: '/' // 很重要，提供了静态资源的路径
}))

const PORT: number = Number(process.env.PORT) || 3000
app.listen(PORT) 
```

- 项目运行时通过 `webpack-dev-middleware` 中间件来调用webpack，以便 `ctx.render` 时渲染的就是编译后的文件；
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
npm install webpack-dev-middleware @types/webpack-dev-middleware --save-dev
```
##### koa-webpack-dev-middleware

```typescript
// src/server/middleware/webpack-dev-middleware.ts
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
// scripts/webpack.config.js

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
module.exports = {
  entry: entries()
}
```

#### 入口文件映射模板文件
由于前端源码使用的typescript/es6/scss，这些文件必须经过编译后才能被浏览器识别。同时，对资源文件的版本处理（加版本号），也需要借助`HtmlWebpackPlugin`这个插件注入到对应模板上。就像流程图中示意的那样，当访问路由时（如 localhost:3000/blog），ejs 加载的并不是 `src/views` 下的模板，**而是编译后（此时 css/js的引用已经注入到页面中）的位于 `dist/views`下的新的模板文件**。




#### ejs模板文件无法使用内存文件的解决方法

#### ejs的默认标签与webpack冲突

#### 前后端typescript配置文件的冲突

### 生成环境(production)流程

### 完整webpack配置