package vmc2awsiot

import (
	"github.com/hypebeast/go-osc/osc"
	"go.uber.org/zap"
)

type OSCDispatcher struct {
	sync VMCSync
}

func NewOSCDispatcher(sync VMCSync) *OSCDispatcher {
	return &OSCDispatcher{
		sync: sync,
	}
}

func (d OSCDispatcher) Dispatch(packet osc.Packet) {

	if packet != nil {
		switch p := packet.(type) {

		case *osc.Message:
			err := d.sync.OSCReceive(p)
			if err != nil {
				zap.L().Warn("message receive failed",
					zap.Error(err),
				)
			}

		case *osc.Bundle:
			bundle := p

			err := d.sync.OSCBundleReceive(bundle.Messages)
			if err != nil {
				zap.L().Warn("message bundle receive failed",
					zap.Error(err),
				)
			}

			for _, bundle := range bundle.Bundles {
				d.Dispatch(bundle)
			}

		default:
			zap.L().Warn("unknown packet type",
				zap.Any("packet", packet),
			)
		}
	}

}
