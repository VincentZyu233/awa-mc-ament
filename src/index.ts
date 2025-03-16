import { Context, h, Schema } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
// @ts-ignore  忽略类型检查
import { } from 'koishi-plugin-canvas'
import fs from 'node:fs/promises'
import path from 'node:path'

export const inject = {
  required: ["puppeteer", "http", "logger", "i18n", "canvas"]
}

export const name = 'qwq-mc-ament'

export const Config = Schema.intersect([
  Schema.object({
    amentCommand: Schema.string().default("ament").description("命令名称"),
    ament_title: Schema.string().default("整装上阵").description("成就标题"),
    ament_description: Schema.string().default("你好，qwq").description("成就描述"),
  }).description('基础设置'),
  Schema.object({
    promptTimeout: Schema.number().default(30).description("等待用户输入图片的超时时间（秒）"),
    usedavatar: Schema.boolean().default(false).description("`未输入图片` 并且 `没有引用图片`的时候，不等待用户输入，直接使用用户头像"),
  }).description('进阶设置'),
  Schema.object({
    ICONpoint: Schema.tuple([Number, Number]).default([45, 45]).description("头像图标的`宽度`和`高度`（px）。`推荐正方形`"),
    fontPath: Schema.string().default(path.join(__dirname, './../assets/Minecraft_AE.ttf')).description("使用的字体文件的绝对路径"),
    backgroundPath: Schema.string().default(path.join(__dirname, './../assets/AdvancementMade_BG.png')).description("使用的背景图文件的绝对路径"),
    screenshotquality: Schema.number().role('slider').min(0).max(100).step(1).default(60).description('设置图片压缩质量（%）'),
  }).description('渲染设置'),
  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("是否开启日志调试模式<br>一般不需要开启"),
    pageclose: Schema.boolean().default(true).description("浏览器有头调试模式<br>非开发者请勿关闭"),
  }).description('开发者设置'),
])

export function apply(ctx: Context, config) {

  ctx.i18n.define("zh-CN", {
    commands: {
      [config.amentCommand]: {
        arguments: {
          ament_title: "成就标题",
          ament_description: "成就描述",
          ament_icon: "成就图标",
        },
        description: "生成一个MC风格的成就图片",
        messages: {
          imageplz: "请发送图片消息：",
          waitTimeout: "未收到图片，操作已取消。",
          invalidimage: "未找到图片链接！",
          failedfetch: "图片访问失败！",
        },
        // session.text(".")
      },
    }
  });

  ctx.command(`${config.amentCommand} [ament_title] [ament_description] [ament_icon:image]`)
    .example(`[引用消息]${config.amentCommand} 这不是铁镐么 升级你的镐`)
    .example(`${config.amentCommand} 整装上阵 用铁盔甲来保护你自己`)
    .example(`${config.amentCommand} 热腾腾的 用桶装点熔岩 [图片消息]`)
    .action(async ({ session }, ament_title, ament_description, ament_icon) => {
      let ament_icon_url: string;
      if (!ament_title || !ament_description) {
        await session.execute(`${config.amentCommand} -h`)
        return
      }
      // 参数处理，移除尖括号内容并trim
      const title = ament_title?.replace(/<[^>]*>/g, '').trim() || config.ament_title;
      const description = ament_description?.replace(/<[^>]*>/g, '').trim() || config.ament_description;

      // 图片获取优先级：引用 > 命令参数 > prompt > 头像
      if (session.quote) {
        logInfo("引用的消息内容：", session.quote?.content);
        ament_icon_url = await extractFirstImageUrl(session.quote?.content);
      } else if (ament_icon) {
        ament_icon_url = await ament_icon.src; // 图片元素或者直链
      } else {
        if (!config.usedavatar) {
          logInfo("等待用户输入...");
          await session.send(session.text(".imageplz"));
          const promptResult = await session.prompt(config.promptTimeout * 1000);
          if (promptResult) { // 确保 promptResult 不为 null 或 undefined
            ament_icon_url = await extractFirstImageUrl(promptResult);
          } else {
            await session.send(session.text(".waitTimeout"));
            return;
          }
        } else {
          ament_icon_url = session.event.user.avatar
        }
      }

      logInfo("标题：", title);
      logInfo("描述：", description);
      logInfo("ICON链接：", ament_icon_url);

      if (!ament_icon_url) {
        await session.send(session.text(".invalidimage"));
        return
      }

      try {
        const imageBuffer = await ctx.http.file(ament_icon_url);
        if (!imageBuffer) {
          await session.send(session.text(".failedfetch"));
          return
        } else (
          logInfo(imageBuffer)
        );

        const backgroundBase64 = await fileToBase64(config.backgroundPath);
        const fontBase64 = await fileToBase64(config.fontPath);
        const amentIconBase64 = Buffer.from(imageBuffer.data).toString('base64');

        const page = await ctx.puppeteer.page();

        // 获取背景图尺寸
        const backgroundImage = await ctx.canvas.loadImage(`data:image/png;base64,${backgroundBase64}`);
        // @ts-ignore  忽略类型检查 // 兼容puppeteer和canvas的canvas调用
        const originalWidth = backgroundImage.naturalWidth || backgroundImage.width;
        // @ts-ignore 忽略类型检查 // 兼容puppeteer和canvas的canvas调用
        const originalHeight = backgroundImage.naturalHeight || backgroundImage.height;

        await page.setViewport({ width: originalWidth, height: originalHeight });

        const html = `
<!DOCTYPE html>
<html>
<head>
<style>
@font-face {
font-family: 'Minecraft';
src: url(data:font/truetype;charset=utf-8;base64,${fontBase64}) format('truetype');
}
body {
margin: 0;
width: ${originalWidth}px;
height: ${originalHeight}px;
background: url(data:image/png;base64,${backgroundBase64}) no-repeat;
background-size: 100% 100%;
background-color: transparent;
display: flex;
flex-direction: row;
align-items: center;
padding: 20px 30px 20px 30px;
box-sizing: border-box;
}

.icon {
width: ${config.ICONpoint[0]}px; /* 图标大小 */
height: ${config.ICONpoint[1]}px; /* 图标大小 */
margin-right: 20px;
margin-left: -5px;
background-image: url(data:image/png;base64,${amentIconBase64}); /* 使用图片 URL */
background-size: cover;
background-position: center;
border-radius: 5px; /* 可选：添加圆角 */
}

.text-container {
flex: 1;
color: #FFFFFF;
font-family: 'Minecraft', sans-serif;
text-shadow: 2px 2px #3F3F3F;
display: flex;
flex-direction: column;
justify-content: space-between;
height: 81%;
align-items: flex-start; /* 左对齐 */
justify-content: center; /* 垂直居中 */
}

.title {
font-size: 16px; /* 调整标题大小 */
margin-bottom: 0;
color: #FCFC00;
}

.description {
font-size: 12px; /* 调整描述大小 */
opacity: 0.8;
}
</style>
</head>
<body>
<div class="icon"></div>
<div class="text-container">
<div class="title">${title}</div>
<div class="description">${description}</div>
</div>
</body>
</html>
`;

        await page.setContent(html);
        await page.waitForNetworkIdle();

        const image = await page.screenshot({
          type: 'jpeg',
          quality: config.screenshotquality,
          encoding: 'base64'
        });

        await session.send(h('image', { url: 'data:image/png;base64,' + image }));
        if (config.pageclose && page) await page.close()
        return

      } catch (error) {
        ctx.logger.error("渲染失败：", error)
        await session.send(`渲染失败: ${error.message}`)
      }
    }
    )
  async function fileToBase64(filePath: string): Promise<string> {
    try {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
      const buffer = await fs.readFile(absolutePath);
      return buffer.toString('base64');
    } catch (error) {
      ctx.logger.error(`Error converting file to base64: ${error.message}`);
      throw error;
    }
  }


  function logInfo(...args: any[]) {
    if (config.loggerinfo) {
      (ctx.logger.info as (...args: any[]) => void)(...args);
    }
  }
  const extractFirstImageUrl = async (content) => {
    if (!content) return ''; // 增加判空，避免 content 为空时报错
    try {
      logInfo("extractFirstImageUrl content:", content);

      let elementContent = content;
      if (typeof content === 'string') {
        elementContent = h.parse(`${content}`); // 确保 content 被解析为 Element
      }

      let url = '';

      const imgElements = h.select(elementContent, 'img, image, mface');
      if (imgElements.length > 0) {
        const firstElement = imgElements[0];
        url = firstElement.attrs?.src || firstElement.attrs?.url || ''; // 优先取 src，然后取 url
      }

      logInfo("extractFirstImageUrl解析结果：", url);
      return url;
    } catch (error) {
      ctx.logger.error("extractFirstImageUrl error:", error);
      return ''; // 发生错误时返回空字符串，避免程序崩溃
    }
  };

}