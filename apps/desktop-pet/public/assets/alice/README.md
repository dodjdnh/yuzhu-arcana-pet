# Local Asset Setup

本仓库不分发角色素材。

如果你要在本地运行完整桌宠，请自行提供本地角色素材，并使用根目录脚本：

```powershell
.\tools\import_alice_assets.ps1 -SourceDir "C:\path\to\your\sprites"
```

说明：

- `manifest.example.json` 是公开模板
- `manifest.json` 是本地运行文件，不提交
- `skins/default_black/` 中的角色图片由你本地导入生成
- 仓库公开部分不包含 `Type-Moon / 魔法使之夜 / 久远寺有珠` 的角色图片素材
