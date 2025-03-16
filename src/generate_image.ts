// generate_image.ts

import { Context } from 'koishi';
import { } from 'koishi-plugin-puppeteer';
import fs, { read, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises';
import path from 'node:path'

export const inject = {
    required: ["puppeteer", "http"]
}

const defaultTemplate = async (options) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        @font-face {
            font-family: 'Minecraft';
            src: url(data:font/truetype;charset=utf-8;base64,${options.fontBase64}) format('truetype');
        }

        body {
            margin: 0;
            width: ${options.width}px;
            height: ${options.height}px;
            background: url(data:image/png;base64,${options.bgBase64}) no-repeat;
            background-size: 100% 100%;  
            background-color: transparent; /* 确保背景色为透明 */
            display: flex;
            flex-direction: row; /* 横向排列 */
            align-items: center; /* 垂直居中 */
            padding: 20px 30px 20px 30px;
            box-sizing: border-box;
        }

        .icon {
            width: 200px;
            height: 200px;
            margin-right: 40px;
            background-image: url(data:image/png;base64,${options.iconBase64}); /* 使用图片 URL */
            
            background-size: cover;

            background-position: center center; /* 居中裁剪 */
            overflow: hidden; /* 隐藏溢出部分 */
            position: relative; /* 为伪元素定位做准备 */
        }

        .text-container {
            flex: 1;
            color: #FFFFFF;
            font-family: 'Minecraft', sans-serif;
            text-shadow: 2px 2px #3F3F3F;
            display: flex;
            flex-direction: column;
            justify-content: space-between; /* 上下排列，确保 title 和 description 分开 */
            height: 81%; /* 确保内容撑满 */
            align-items: flex-end; /* 右对齐 */
        }

        .title {
            font-size: 72px;
            margin-bottom: 0;
            color: #FCFC00;
            align-self: flex-start; /* 右上角 */
        }

        .description {
            font-size: 72px;
            opacity: 0.8;
            align-self: flex-start; /* 右下角 */
        }
    </style>
</head>
<body>
    <div class="icon"></div>
    <div class="text-container">
        <div class="title">${options.title}</div>
        <div class="description">${options.description}</div>
    </div>
</body>
</html>
`;


/**
 * 生成 Minecraft 风格成就图片
 * --------------------------------------------------
 * @param {Object} config - 配置对象
 * @param {string} config.title - 成就标题（黄色大字，例如"终极成就!"）
 * @param {string} config.description - 成就描述（白色小字，例如"获得所有物品"）
 * @param {string} config.icon - 图标资源，根据 iconMode 决定是本地路径还是 base64
 * @param {'path'|'base64'|'url'} [config.iconMode='path'] - 图标模式：path=本地文件路径，base64=直接传入base64数据
 * @param {string} [config.savePath='./output'] - 图片输出目录路径（默认当前目录下的output文件夹）
 * @returns {Promise<string>} 返回生成图片的完整保存路径
 * @throws {Error} 渲染失败时抛出异常
 * 
 * @example
 * renderAmentImage({
 *   title: "矿工大师!",
 *   description: "挖掘1000块钻石矿",
 *   icon: './diamond.png',
 *   savePath: './achievements'
 * });
 */

export async function renderAmentImage(
    ctx: Context,
    args: {
        title,
        description,
        icon,
        iconMode,
        width,
        height,
        // fontPath,
        // bgPath
        fontBase64,
        bgBase64,
        page_screenshotquality
    }
) {
    const browserPage = await ctx.puppeteer.page();
    try {
        if (args.iconMode === "url") {
            await ctx.http.head(args.icon)
        }

        // const bgPath = ctx.http.file(path.join(ctx.baseDir, 'assets', 'AdvancementMade_BG.png'));
        // const fontPath = ctx.http.file(path.join(ctx.baseDir, 'assets', 'Minecraft_AE.ttf'));

        let arg_icon;
        if (args.iconMode === "path")
            arg_icon = `data:image/png;base64,${await readFile(args.icon, 'base64')}`;
        else if (args.iconMode === "base64")
            arg_icon = args.icon;
        else if (args.iconMode === "url")
            arg_icon = `url(${args.icon})`;

        const html = await defaultTemplate({
            title: args.title,
            description: args.description,
            iconBase64: args.icon,
            width: 1280,
            height: 256,
            bgBase64: args.bgBase64,
            fontBase64: args.fontBase64
        })

        writeFileSync(path.join(__dirname, 'tmp.html'), html)

        browserPage.on('console', msg => {
            ctx.logger.debug(`Puppeteer console: ${msg.text()}`);
        });
        browserPage.on('pageerror', error => {
            ctx.logger.error(`Puppeteer page error: ${error.message}`);
        });

        await browserPage.setContent(html);
        await browserPage.setViewport({ width: 1280, height: 256 });

        const res = await browserPage.screenshot({
            encoding: 'base64',
            type: 'jpeg',
            omitBackground: true,
            fullPage: true,
            quality: args.page_screenshotquality
        })

        return res;

    } catch (e) {
        ctx.logger.error(`error: ${e}`);
    } finally {
        // await browserPage.close();
    }
}