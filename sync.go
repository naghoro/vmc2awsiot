package vmc2awsiot

import (
	"context"
	"fmt"
	"strings"
	"vmc2awsiot/sender"

	"github.com/hypebeast/go-osc/osc"
	"go.uber.org/zap"
)

type VMCSync interface {
	OSCReceive(*osc.Message) error
	Run(context.Context)
}

type sync struct {
	sender sender.VMCSender
	buffer chan string
}

func NewVMCSync(s sender.VMCSender) VMCSync {
	ch := make(chan string)
	return &sync{sender: s, buffer: ch}
}

func (s sync) OSCReceive(msg *osc.Message) error {
	// パスとメッセージをスペースで区切って送信する
	var b strings.Builder
	b.WriteString(msg.Address)

	for _, args := range msg.Arguments {
		b.WriteString(fmt.Sprintf(" %+v", args))
	}

	return s.receive(b.String())
}

func (s sync) receive(msg string) error {
	s.buffer <- msg
	return nil
}

func (s sync) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-s.buffer:
			zap.L().Debug("send", zap.Any("msg", msg))
			err := s.sender.Send(ctx, msg)

			if err != nil {
				zap.L().Warn("send failure", zap.Error(err))
			}
		}
	}
}