package main

import (
	"context"
	"fmt"
	"vmc2awsiot"
	"vmc2awsiot/sender/mqttsender"

	"github.com/hypebeast/go-osc/osc"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func main() {
	logconf := zap.NewProductionConfig()
	logconf.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	logconf.Level.SetLevel(vmc2awsiot.LOG_LEVEL)

	logger := zap.Must(logconf.Build())
	defer logger.Sync()

	zap.ReplaceGlobals(logger)

	sender := mqttsender.NewMQTTSender()

	if err := sender.Open(); err != nil {
		panic(err)
	}
	defer sender.Close()

	vs := vmc2awsiot.NewVMCSync(sender)

	d := vmc2awsiot.NewOSCDispatcher(vs)

	ctx, cancel := context.WithCancel(context.Background())

	go vs.Run(ctx)
	defer cancel()

	zap.L().Info("start")

	addr := fmt.Sprintf("127.0.0.1:%d", vmc2awsiot.OSC_PORT)

	server := &osc.Server{
		Addr:       addr,
		Dispatcher: *d,
	}
	server.ListenAndServe()

	fmt.Printf("test\n")
}
