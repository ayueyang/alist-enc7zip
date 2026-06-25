alist-enc7zip 桌面版
======================

【这是什么】
alist-enc7zip 是 alist 的透明加密代理：上传文件时自动加密，下载/播放时自动解密。
加密后的文件存到网盘，云盘无法扫描识别内容，防止资源被删除。
本程序已内嵌 Node.js 运行时，解压即用，无需安装任何环境。


【使用步骤】

1. 解压 alist-enc7zip.zip
   - 用 7-Zip / WinRAR / Windows 自带解压均可
   - 解压后得到 alist-enc7zip\ 文件夹（含完整项目源码）

2. 进入 alist-enc7zip\ 文件夹，双击 安装.bat
   - 检测是否已安装（已在运行则直接打开网页）
   - 检测 alist/openlist，没有则提示下载 openlist（推荐）
   - 配置端口
   - 在桌面创建 4 个快捷方式

3. 桌面会出现 4 个快捷方式：
   - alist-enc7zip 代理  →  访问加密后的 alist（普通用户用这个）
   - alist-enc7zip 管理  →  配置加密（管理员用这个，账号 admin 密码 admin123）
   - alist-enc7zip 启动  →  双击启动服务（已在运行则直接打开网页）
   - alist-enc7zip 停止  →  双击停止服务

4. 日常使用：双击桌面"alist-enc7zip 代理"或"alist-enc7zip 启动"即可


【首次配置加密】

1. 双击桌面"alist-enc7zip 管理"快捷方式
2. 用 admin / admin123 登录
3. 在"alist 服务设置"里配置加密：
   - 加密类型: AES-CTR（推荐，速度最快）/ ChaCha20 / RC4 / 7z-AES-CBC / WinZip-AES-CTR
   - 加密密码: 自己设一个密码
   - 加密路径: 哪些文件夹需要加密（如 movie/*）
4. 保存后，通过"alist-enc7zip 代理"访问的文件会自动加密/解密


【openlist 说明】

openlist 是 alist 的社区维护 fork，推荐使用。
install.bat 下载的 openlist 默认：
  - 地址: http://127.0.0.1:5244
  - 账号: admin
  - 密码: 123456
登录后请到 openlist 管理界面修改密码并添加网盘存储。


【文件说明】

安装.bat / install.ps1       首次安装/配置（解压后双击运行）
start.bat / start.ps1        启动 enc7zip（已在运行则直接打开网页）
stop.bat                     停止服务
openlist-start.bat           启动 openlist（仅安装下载了 openlist 才有）
openlist-stop.bat            停止 openlist
node\node.exe                Node.js 运行时（内嵌，勿删）
node-proxy\                  enc7zip 后端项目（源码 + 构建产物 dist）
enc-webui\                   加密管理面板前端项目
conf\                        配置目录（运行时生成）


【常见问题】

Q: 双击 安装.bat 没反应？
A: 右键 → 以管理员身份运行；或检查杀毒软件是否拦截

Q: 端口被占用？
A: 双击 安装.bat 重新配置端口，或编辑 conf\config.json 修改 port 字段

Q: 启动后网页打不开？
A: 等待 10 秒让服务启动完成；或查看 start.bat 窗口是否有报错

Q: 加密配置在哪改？
A: 双击桌面"alist-enc7zip 管理"快捷方式登录管理面板

Q: 如何开机自启？
A: 右键 start.bat → 创建快捷方式 → 把快捷方式放到启动文件夹
   （Win+R 输入 shell:startup 打开启动文件夹）

Q: 重装系统后怎么办？
A: 重新解压 zip 并双击 安装.bat 即可，配置在 conf\ 目录，备份这个目录就能保留加密配置


【原版地址】
https://github.com/traceless/alist-encrypt
