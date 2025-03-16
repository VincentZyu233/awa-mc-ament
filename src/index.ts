// index.ts
import { Context, Schema, Session, h } from 'koishi'
import { readFileSync } from 'fs';
import path from 'node:path';
import { renderAmentImage } from './generate_image'
import { readFile } from 'fs/promises';

export const name = 'koishi=plugin-qwq-mc-ament'

export const inject = {
    required: ["puppeteer", "http", "i18n"]
}

// export interface Config { }

export const Config = Schema.intersect(
    [
        Schema.object(
            {
                fontPath: Schema.string().default(path.join(__dirname, './../assets/MinecraftAE.ttf')).description("字体文件绝对路径"),
                // fontPath: Schema.string().default(path.join(__dirname, './../assets/类像素字体_俐方体11号.ttf')).description("字体文件绝对路径"),
                bgPath: Schema.string().default(path.join(__dirname, './../assets/AdvancementMade_BG.png')).description("背景图绝对路径"),
            }
        ).description("Assets-静态资源资产相关"),
        Schema.object(
            {
                page_screenshotquality: Schema.number().role('slider').min(0).max(100).step(1).default(60).description("Puppeteer截图质量参数， 图片压缩质量, 范围0-100")
            }
        ),
        Schema.object(
            {
                VerboseLoggerMode: Schema.boolean().default(false).description("是否开启详细输出")
            }
        )
    ]
)

export function apply(ctx: Context, config) {
    // ctx.command('ament [arg0_title:string] [arg1_description:string]')
    // .action(async ({ session, options }, arg0_title, arg1_description) => {
    ctx.command('ament', "生成MC风格的成就/进度图片\n" + "\t【注意图标获取的优先级】：引用消息的图片 > 参数传入的图片 > at用户的头像 > 默认fallback幸运方块图标。【没说明白就去看source code】\n")
        // .subcommand("help")
        .option("arg0_title", '-t, --title <arg0_title:string> 成就标题', { fallback: "请输入标题" })
        .option("arg1_description", '-d, --description <arg1_description:string> 成就描述', { fallback: "请输入描述" })
        .option("arg2_icon", '-i, --icon <arg2_icon:image> 成就图标')

        .action(async ({ session, options }) => {
            const ament_title = options.arg0_title;
            const ament_description = options.arg1_description;

            const fallback_img_path = path.join(__dirname, './../assets/fallback_icon.jpg');
            const fallback_base64_str = readFileSync(fallback_img_path).toString('base64');
            const fallback_base64_str_with_head = `data:image/jpeg;base64,${fallback_base64_str}`;

            // icon优先级：引用消息的图片 > 参数传入的图片 > at用户的头像 > 默认fallback幸运方块图标
            // "QUOTEMSG" > "CMDARG" > "ATUSER" > "LUCKYBLOCK"

            let iconSource = "LUCKYBLOCK";
            const firstAtUser = extractAtUser(session.content);
            if (config.VerboseLoggerMode)
                ctx.logger.info("fitstAtUser = " + firstAtUser);

            if ('id' in firstAtUser)
                iconSource = "ATUSER";
            if (options.arg2_icon)
                iconSource = "CMDARG";
            if (session.quote) {
                const firstImgUrl = await extractFirstImageUrl(session.quote.content);
                if (firstImgUrl !== "")
                    iconSource = "QUOTEMSG"
            }
            if (config.VerboseLoggerMode) {
                await session.send(`[debug]iconSource = ${iconSource}`);
            }

            let icon_format;
            let ament_icon_image_element; //可能是一个url，也可能是一个base64字符串, 总之是一个支持作为消息元素的格式
            if (iconSource === "QUOTEMSG") { //引用是url
                icon_format = "url";
                ament_icon_image_element = await extractFirstImageUrl(session.quote.content);
            } else if (iconSource === "CMDARG") { //指令里面的参数是url
                icon_format = "url";
                ament_icon_image_element = options.arg2_icon.src;
            } else if (iconSource === "ATUSER") { //at 用户是url
                icon_format = "url";
                const firstUserDict = extractAtUser(session.content);
                ament_icon_image_element = (await session.bot.getUser(firstUserDict['id'], session.event.guild.id)).avatar;
            } else if (iconSource === "LUCKYBLOCK") { //静态资源幸运方块是base64
                icon_format = "base64";
                ament_icon_image_element = fallback_base64_str_with_head;
            }

            if (config.VerboseLoggerMode) {
                await session.send(
                    `[debug]ament_title = ${ament_title}, ament_desc = ${ament_description}, ament_icon_image_element = `
                    + h.image(ament_icon_image_element)
                );
            }
            logInfo(`[debug]ament_title = ${ament_title}, ament_desc = ${ament_description}, ament_icon_image_element = ` +
                ament_icon_image_element.slice(0, 50));


            if (config.VerboseLoggerMode)
                await session.send(`[debug]icon_format = ${icon_format}`);

            if (config.VerboseLoggerMode) {
                if (icon_format === "url") //ament_icon是url字符串
                    await session.send(`[debug]ament_icon_url = ${ament_icon_image_element}`);
                else if (icon_format === "base64") //ament_icon是base64字符串
                    await session.send(`[debug]ament_icon_base64 = ${ament_icon_image_element.slice(0, 50)}...`)
            }


            let ament_icon_base64;
            if (icon_format === "base64") {
                ament_icon_base64 = fallback_base64_str;
            } else if (icon_format === "url") {
                const ament_icon_buffer = await ctx.http.file(ament_icon_image_element);
                ament_icon_base64 = Buffer.from(ament_icon_buffer.data).toString('base64');
            }
            if (config.VerboseLoggerMode)
                await session.send(`[debug]ament_icon_base64 = ${ament_icon_base64.slice(0, 50)}`)

            if (config.VerboseLoggerMode) {
                await session.send(`[debug]fontpath = ${config.fontPath}`);
                await session.send(`[debug]bgpath = ${config.bgPath}`);
            }
            const font_base64 = await fileToBase64(config.fontPath);
            const bg_base64 = await fileToBase64(config.bgPath);

            const res = await renderAmentImage(
                ctx,
                {
                    title: ament_title,
                    description: ament_description,
                    icon: ament_icon_base64,
                    iconMode: 'base64',
                    width: 320,
                    height: 64,
                    // fontPath: path.join(ctx.baseDir, 'assets', 'Minecraft_AE.ttf'),
                    // bgPath: path.join(ctx.baseDir, 'assets', 'AdvancementMade_BG.png')
                    fontBase64: font_base64,
                    bgBase64: bg_base64,
                    page_screenshotquality: config.page_screenshotquality
                }
            )

            // await session.send(h.image(res));
            // await session.send(`[debug] res:${res.slice(0, 50)}`);
            await session.send(
                h(
                    'image',
                    { url: 'data:image/png;base64,' + res }
                )
            )
        })

    function logInfo(...args: any[]) {
        (ctx.logger.info as (...args: any[]) => void)(...args);
    }

    const extractImageUrl = (content) => {
        let urls = h.select(content, 'img').map(item => item.attrs.src);
        if (urls?.length > 0) {
            return urls;
        }
        urls = h.select(content, 'mface').map(item => item.attrs.url);
        return urls?.length > 0 ? urls : null;
    };

    async function fileToBase64(filePath: string): Promise<string> {
        try {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
            const buffer = await readFile(absolutePath);
            return buffer.toString('base64');
        } catch (error) {
            ctx.logger.error(`文件转换成base64失败: ${error.message}`);
            throw error;
        }
    }

    const extractFirstImageUrl = async (content) => {
        if (!content) {
            // throw Error('content是空的');
            return "";
        }

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
            // throw Error("有错误:" + error);
            return ''; // 发生错误时返回空字符串，避免程序崩溃
        }
    };

    const extractAtUser = (content) => {
        if (!content) {
            // throw Error('content是空的');
            return "";
        }
        try {
            if (config.VerboseLoggerMode)
                logInfo("extractextractAtUser content:", content);

            let elementContent = content;
            if (typeof content === 'string') {
                elementContent = h.parse(`${content}`);
            }

            let user = {};

            const atElements = h.select(elementContent, 'at');
            if (atElements.length > 0) {
                const firstElement = atElements[0];
                user = firstElement.attrs;
            }
            if (config.VerboseLoggerMode)
                logInfo("extractAtUser解析结果: ", user)
            return user;
        } catch (error) {
            ctx.logger.error("extractFirstImageUrl error:", error);
            // throw Error("有错误:" + error);
            return ''; // 发生错误时返回空字符串，避免程序崩溃
        }
        // const elements = h.parse(content);
        // const atElements = h.select(elements, 'at');
        // return atElements.length > 0 ? atElements[0].attrs : null;
    };
}
