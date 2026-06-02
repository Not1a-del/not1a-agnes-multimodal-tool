# 贡献说明

欢迎提交问题反馈和改进建议。

## 反馈问题

提交 issue 时，建议包含：

- 使用的供应商或接口类型。
- 选择的模型名。
- 页面栏目：生图、生视频、聊天测试或查任务。
- 接口返回的错误摘要。
- “请求体”面板中复制的脱敏 cURL。

请不要提交真实 API Key、私有中转地址、个人生成记录或敏感图片。

## 本地检查

修改后建议至少运行：

```powershell
node -c .\web_tool\app.js
python -m py_compile .\web_tool\server.py .\build.py
python .\build.py
```

如果改了界面，请启动本地服务并在浏览器里实际点一遍相关功能。
