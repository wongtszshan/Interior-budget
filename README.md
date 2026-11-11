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
