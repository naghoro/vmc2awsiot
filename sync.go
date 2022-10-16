package vmc2awsiot

import (
	"context"
	"fmt"
	"strings"
	"vmc2awsiot/sender"

	"github.com/hypebeast/go-osc/osc"
	"go.uber.org/multierr"
	"go.uber.org/zap"
)

type VMCSync interface {
	OSCReceive(*osc.Message) error
	OSCBundleReceive(msgs []*osc.Message) error
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

// ... 送信対象とするかどうか
func (s sync) oscFilter(msg *osc.Message) bool {
	if strings.HasPrefix(msg.Address, "/VMC/Ext/Blend/Apply") {
		return false
	}

	if strings.HasPrefix(msg.Address, "/VMC/Ext/Bone/") {
		return true
	}

	return false
}

func (s sync) OSCReceive(msg *osc.Message) error {
	// パスとメッセージをスペースで区切って送信する
	if !s.oscFilter(msg) {
		return nil
	}

	var b strings.Builder
	b.WriteString(msg.Address)

	for _, args := range msg.Arguments {
		b.WriteString(fmt.Sprintf(" %+v", args))
	}

	return s.receive(b.String())
}

func (s sync) OSCBundleReceive(msgs []*osc.Message) error {
	// バンドルされたメッセージを同時に送信する
	// パスとメッセージをスペースで区切って送信する

	var (
		// key -> address, value -> Arugument複数存在
		bundleMessges = map[string][]string{}
		merr          error
	)

	for _, msg := range msgs {

		if !s.oscFilter(msg) {
			continue
		}

		if _, ok := bundleMessges[msg.Address]; !ok {
			bundleMessges[msg.Address] = []string{}
		}

		var b strings.Builder

		for _, args := range msg.Arguments {
			b.WriteString(fmt.Sprintf(" %+v", args))
		}

		bundleMessges[msg.Address] = append(bundleMessges[msg.Address], b.String())
	}

	// addressごとに送信する
	for addr, values := range bundleMessges {
		v := fmt.Sprintf(
			"%s%s",
			addr,
			strings.Join(values, "\n"),
		)

		err := s.receive(v)

		if err != nil {
			merr = multierr.Append(merr, err)
		}
	}

	return merr
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
