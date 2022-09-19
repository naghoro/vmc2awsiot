package vmc2awsiot

import (
	"context"
	"testing"
	"vmc2awsiot/sender/print"

	"go.uber.org/goleak"
)

func Test_sync_Run(t *testing.T) {
	defer goleak.VerifyNone(t)

	tests := []struct {
		name string
		s    VMCSync
	}{
		{
			name: "success test",
			s:    NewVMCSync(&print.PrinteCheck{}),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			go tt.s.Run(ctx)
			defer cancel()
		})
	}
}
