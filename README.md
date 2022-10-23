# vmc to awsiot

VMCのデータを AWS IoT に送るプログラムです。

AWS IoTを経由してWEBなどでアバターを動かして見せられる事を想定しています。（そのサンプルもあります。）

## prerequisite

- AWS IoTの設定については、フォロー出来ていません。

- 送るプログラムは、Goで実装しているのGoをビルドできる環境が必要です。

- WEBのサンプルプログラムは、typescript(javascript)をnpmでビルドできる環境が必要です。


# VMCをAWS IoTに送るプログラム

AWS IoT(mqtt)を使ってVMCの情報を送ります。

※送る情報は、boneのposとrotのみに絞っています。


<strong>（注意）大量のデータを送るので、試すときはAWSの料金はお気をつけ下さい。</strong>


setting.go の各値を環境に応じて設定してください。
VMCを受けるポートと、AWSIoTの通信、認証に必要な設定です。


```
OSC_PORT  = 8765
LOG_LEVEL = zapcore.InfoLevel

IOT_ENDPOINT   = "<your aws iot endpoint>"
IOT_CA         = "<AmazonRootCA1.pem file path>"
IOT_CLIENTCERT = "<your aws iot certificate file path>"
IOT_CLIENTKEY  = "<your aws iot private key file path>"
IOT_CLIENT_ID  = "<your aws iot thing name>"
```

変更できたら、windows用にプログラムをビルドします。（シェルはLinuxで実行する想定で記載しています。）

```
./scripts/windowsbuild.sh 
```

ビルドができたら、実行します。

```
./vmc2awsiot.exe
```





# awsiot からデータを受けて、WEBでアバターを動かすサンプル

サンプルは下記を参考、利用しています。

https://github.com/aws/aws-iot-device-sdk-js-v2/tree/main/samples#nodepub_sub

https://github.com/pixiv/three-vrm


## ビルドと確認

テスト用には下のコマンドでビルドできます。

```
npm run build:dev
```

ビルドが完了したら、WEBサーバなどで index.html を開いて確認できます。

## サンプルを変更する時の参考

three-vrmで動かすときに、Unityと座標軸が異なるので変換が必要。方法は下記ページが参考になります。

https://vrm-c.github.io/UniVRM/ja/implementation/coordinate.html
