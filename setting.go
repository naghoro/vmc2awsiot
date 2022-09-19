package vmc2awsiot

import "go.uber.org/zap/zapcore"

const (
	OSC_PORT  = 8765
	LOG_LEVEL = zapcore.InfoLevel

	IOT_ENDPOINT   = "<your aws iot endpoint>"
	IOT_CA         = "<AmazonRootCA1.pem file path>"
	IOT_CLIENTCERT = "<your aws iot certificate file path>"
	IOT_CLIENTKEY  = "<your aws iot private key file path>"
	IOT_CLIENT_ID  = "<your aws iot thing name>"
)
