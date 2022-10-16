# vmc to awsiot

VMCのデータを awsiot に送ります。

awsiot で受けたデータを WEB 上で動かします。

## VMCに送るプログラム

## awsiot の構築

## awsiot からデータを受けて、WEBでアバターを動かすサンプル

サンプルは下記を参考、利用しています。

https://github.com/aws/aws-iot-device-sdk-js-v2/tree/main/samples#nodepub_sub

https://github.com/pixiv/three-vrm

npm i --save-dev @types/three


three-vrmで動かすときに、Unityと座標軸が異なるので変換が必要。方法は下記ページが参考になります。

https://vrm-c.github.io/UniVRM/ja/implementation/coordinate.html
