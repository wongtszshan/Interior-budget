# 住有计划 · Interior Budget v1.0

装修预算 PWA。**初始的 17 项预算及 ¥69,000 已存入 `wongtszshan/Interior-budget-data` 私库，需连接 Worker 并点击“从私库读取”才会显示；未连接时显示空白模板。**\n\n**代码仓库公开；个人预算、合同、PDF 和发票绝不应提交到这个仓库。**

## 当前完成

- 手机/桌面自适应总览、分类明细；17 条真实初始记录已写入私人数据仓库（公开前端只包含空白模板）
- 金额全部为人民币（CNY），计划预算、报价、成交价、付款分离
- 分类和项目的创建、编辑、删除；数量×单价；总览统计与未报价项目
- 多供应商报价记录、按项目记录定金/尾款/退款
- PDF/图片上传到本地 IndexedDB，文件元数据在预算数据中
- JSON/CSV 导出、JSON 导入；可安装 PWA；本地离线缓存
- Cloudflare Worker API 框架，可访问 GitHub 私库实现数据与文件同步

## 安全与存储

公开 GitHub Pages 前端无任何 GitHub Token；所有敏感写入仅通过 Worker 完成。Worker 请求需要强随机访问口令（APP_PASSWORD），存储在浏览器 sessionStorage 中，仅当前会话有效。Worker 只允许 ALLOWED_ORIGIN 指定的来源发起跨域请求。注意：**CORS 不是身份验证**；口令必须足够强（最少 24 位随机字符），并为 Worker 配置 Cloudflare WAF 速率限制；推荐将 Worker 额外放入 Cloudflare Access 保护之下（如适用）。合同中敏感身份证号、银行信息建议上传前脱敏。

浏览器本地附件只存在本机，删除站点数据可能导致丢失。**只有点击“同步到私库”并显示成功，才能认为附件已经上传到 GitHub 私库。** JSON 备份不包含附件二进制文件。项目的费用、报价单、合同与已付款分别记录，避免重复计费。

## GitHub Pages

前往公开仓库 **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save**。地址一般是 `https://wongtszshan.github.io/Interior-budget/`（以 Pages 实际显示为准）。

## Cloudflare Worker 配置（同步前必须完成）

1. 使用 Cloudflare Workers 部署 `worker/src/index.js`（Wrangler 项目配置：`worker/wrangler.toml`）；`wrangler deploy --config worker/wrangler.toml` 或在 Worker 项目目录执行。
2. 在 GitHub 创建 **fine-grained Personal Access Token**，只授予 `wongtszshan/Interior-budget-data` 的 **Contents: Read and write** 权限。切勿公开 Token。
3. 在 Worker 变量 Secrets 添加 `GITHUB_TOKEN` 和 `APP_PASSWORD`。APP_PASSWORD 使用至少 24 字节高熵随机字符串，不要使用普通登录密码。
4. 校验 `GITHUB_REPO=wongtszshan/Interior-budget-data`、`ALLOWED_ORIGIN=https://wongtszshan.github.io`。若未来换域名，需更新 ALLOWED_ORIGIN。
5. 建议 Cloudflare WAF 限速保护；如果额外启用 Cloudflare Access，需要确认 GitHub Pages 到跨域 Worker 的登录和 CORS 流程兼容，不能仅开启保护就假定浏览器可访问。
6. 在网站“设置与数据”中填写 Worker URL 和 APP_PASSWORD，点击“连接并检查”，然后先确认云端是否已有数据，再点“同步到私库”。

**状态说明：** 前端和 Worker 源码已入库，但在 Worker Secret 与部署完成前，云端同步不能工作。不要将代码提交当作“数据已安全上云”。

## 文件限制及提醒

- 第一个版本只接收 PDF、JPG、PNG、WebP；每份文件上限 7 MB（适配 GitHub Contents API 与 Worker 的实际限制）。
- GitHub 私库适用于少量文档；多份大 PDF、装修图纸、高频文件变更，建议后续迁移到 Cloudflare R2。
- Worker 的浏览器来源校验只是附加限制，不是防止持有口令的攻击者通过非浏览器访问的安全边界。
- 公开站点中的任何内容都可被访问者查看，因此请仅在私库中保存真实预算资料。

## 数据结构

- `data/budget.json`：预算类别、项目、供应商报价、付款流水、文件索引。
- `documents/{id}.{ext}`：PDF 或图片原件。文件名采用随机 ID，原始名称只写在私有 JSON 中。

## 改进方向

独立交易对账、文件版本历史、合同条款提醒、报价对比、R2 大文件存储、PDF 结构化解析、多人协作、跨设备冲突合并。

## v1.1 — 30 天设备登录与自动同步

- Cloudflare Worker 新增 `SESSION_SECRET`（高熵 Secret，至少 32 个字符），用 HMAC-SHA256 签发最长有效期 30 天的设备令牌。
- 首次在每台设备输入 `APP_PASSWORD` 进行验证；浏览器只持久保存会话令牌，不保存原始口令与 GitHub Token。
- 打开/切回 App 自动读取私库数据；编辑后自动同步，失败时保留本地改动，联网后再尝试。
- 同一预算在其他设备修改后，以 GitHub blob SHA 做冲突检测；发生冲突时暂停自动覆盖。冲突处理前先导出本地 JSON 备份。
- 新增「退出此设备」。它会清除当前设备保存的令牌，**不会撤销已签发令牌的服务端有效性**；如设备丢失，可轮换 `SESSION_SECRET` 使全部旧设备会话失效。
- 30 天会话令牌保存在浏览器 localStorage。请保持设备锁屏、系统安全更新，避免在共享电脑授权。敏感合同建议额外保护和备份。
- 2026-11-11 已由应用连接更新 Cloudflare Worker `interior-budget-api`，且新建了 `SESSION_SECRET`；此前 4 个变量保留。

## Excel 文件支持（v1.3）
- 上传 `.xlsx` 和 `.xls` 作为私人附件，保存到 `documents/{id}.xlsx` 或 `.xls`；单文件限制 7 MB。
- 点击“打开”后在文件面板下载，使用 Excel/WPS 查看原文件；目前不自动解析工作簿或导入费用。
- 未来支持安全本地表格预览和人工确认后的预算明细导入。

## v1.4 Excel 本机预览及确认导入

- 点击已上传的 Excel 附件 →「打开」，可在 App 内查看工作表。
- 按工作表、表头行、项目名称、数量、单位、单价、合计金额自定义映射；预览实际选中的报价明细。
- Excel 解析使用官方 SheetJS Community Edition 0.20.3 浏览器脚本，仅在需要预览时从其官方 CDN 加载。文件本体仍由本地浏览器解析，不发送到第三方解析接口；首次加载需要联网。为增强长期离线可靠性，未来建议将依赖固定版本托管到公开仓库。
- 选择目标预算分类与供应商，勾选条目后由用户确认，才会新增到预算明细，不覆盖现有记录，也不修改源 Excel。
- 名称与已存在预算项目重复的行默认跳过。零金额或缺少有效金额的行不会导入；项目合计金额有值而单价缺失时使用「总价 ÷ 数量」计算单价。最多导入前 1000 个有效行。
- Excel 中公式展示的是文件已保存的缓存值，不会重新计算公式。复杂的多级合并表头、带隐藏行的特殊报价表可能需要手动调整或重新排版。
- 表格源文件保留在私库的 `documents/`；自动同步成功后，新增的预算数据写入私库的 `data/budget.json`。

## v1.5 — Hybrid GitHub + R2 attachments

- 新建独立私有 R2 存储桶 `interior-budget-private-files`，不启用公共访问 URL；Worker 绑定名称 `DOCUMENTS`。
- 文件单份最大 80 MiB。小于等于 7 MiB 的文件仍保存到 GitHub 私库 `documents/`；超过 7 MiB 自动通过 Worker 流式写入 R2 `documents/{id}.{ext}`，避免 Base64 放大与 Git 历史膨胀。
- 文件元信息记录在 GitHub 私库 `data/budget.json` 中，标记 `storage: 'github' | 'r2'`，已有附件兼容旧记录。
- Worker 登录及 30 天令牌、同源限制保留；不向外开放 R2 公共端点。大文件请求需要客户端联网并确认同步成功，上传前先缓存在 IndexedDB。
- Cloudflare Free 计划当前入站请求大小上限 100 MB，故应用保守使用 80 MiB；超过此大小的文件未来可使用 R2 分片上传。
- R2 免费额度以官方最新价格页为准，超过免费额度可能产生存储及操作费用。

## v1.6 — 统一 R2 附件存储
- 所有新上传附件（PDF、Excel、图片）统一保存在私有 Cloudflare R2 存储桶 `interior-budget-private-files`。
- GitHub 私库 `data/budget.json` 只保存预算记录和文件索引，旧 `storage: github` 附件仍有兼容读取接口。
- 文件通过 Worker 身份验证传输，最大 80MiB，不对外公开 R2 存储桶。用户授权删除的两份旧 PDF 会同时从 `documents/` 与预算文件索引中清除；请先确保留有原文件用于重新上传。

## v1.6.2 — 连续滚动 PDF 阅读器
- 使用 Mozilla PDF.js 在浏览器本地解析 PDF，取代在部分手机上只能看到第一页的 iframe。
- 支持多页纵向滚动、放大缩小、适应宽度；使用可见区域按需渲染，保留下载原文件功能。
- PDF.js 3.11.174 CDN 初次使用需联网；PDF 内容本身不传给第三方 PDF 解析服务。

## v1.6.3 — Mobile PDF & Excel readers
- PDF：修复小屏幕嵌套 flex 滚动与页面占位被压缩的问题；新增上一页/下一页操作按钮，并主动预加载前三页，供 iOS Safari/PWA 作为滑动备用。
- Excel：默认只读预览，支持切换工作表与表格双向滚动；预算导入隐藏在用户主动点击「导入预算明细」后的独立视图中，不对任意 Excel 文件自动导入。
- 手机表格当前预览最多显示前 250 行、60 列；超过限制请下载原文件进行完整查看。原 Excel 文件不会修改，导入前仍需二次确认。
