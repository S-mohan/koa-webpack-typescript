import * as Koa from 'koa'
import * as path from 'path'
import * as Router from 'koa-router'

const app: Koa = new Koa()

// render
require('koa-ejs')(app, {
  // @ts-ignore
  // root 为经过webpack编译后的真实模板路径
  root: path.resolve(__dirname, '../../dist/views'),
  layout: false,
  viewExt: 'html',
  cache: false,
  debug: false,
  // delimiter: '?',
})

// router
const router: Router = new Router()

router
.get('/', async (ctx: Koa.Context) => {
  await ctx.render('index', {
    title: '首页'
  })
})
.get('/blog', async (ctx: Koa.Context) => {
  await ctx.render('blog', {
    title: '博客'
  })
})

app
  .use(router.routes())
  .use(router.allowedMethods())


export default app