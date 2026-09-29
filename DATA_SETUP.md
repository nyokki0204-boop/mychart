# 無料データの設定

1. チャートの⚙ → 株価 → Alpacaで、無料アカウントの Key ID と Secret Key をこの端末に一度だけ設定します。Alpacaが未設定なら、既存のTwelve Dataキーを使用します。AlpacaはSIPの15分以上遅延した履歴です。
2. GitHubリポジトリの Settings → Secrets and variables → Actions に `FINNHUB_API_KEY` を登録します。Actionsの「Update earnings calendar」を手動実行すると `data/earnings.json` が更新され、その後は1日2回更新されます。公開サイトに反映するにはGitHub Pagesがこのリポジトリの公開ブランチを配信している必要があります。
3. 過去の売上高・EPS成長率が必要なら、チャートの⚙ → 業績履歴で既存のAlpha Vantageキーを設定します。Finnhubの発表前予想は設定日以降に蓄積されます。

価格の取得に失敗した場合は「未取得」と表示されます。APIキーはこの端末に保存され、GitHubへは送信されません。共有端末ではキーを登録しないでください。
