package vmc2awsiot

import (
	"context"
	"testing"
	"time"
	"vmc2awsiot/mock/mock_sender"
	"vmc2awsiot/sender/print"

	"github.com/golang/mock/gomock"
	"github.com/hypebeast/go-osc/osc"
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

func Test_sync_oscFilter(t *testing.T) {
	type args struct {
		msg *osc.Message
	}
	tests := []struct {
		name string
		s    sync
		args args
		want bool
	}{
		// フィルターの通る通らないをチェック
		{
			name: "success ok path",
			s:    sync{},
			args: args{
				msg: &osc.Message{
					Address: "/VMC/Ext/Bone/Pos",
				},
			},
			want: true,
		},
		{
			name: "ng: bone path is only valid",
			s:    sync{},
			args: args{
				msg: &osc.Message{
					Address: "/VMC/Ext/Hmd/Pos",
				},
			},
			want: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.s.oscFilter(tt.args.msg); got != tt.want {
				t.Errorf("sync.oscFilter() = %v, want %v", got, tt.want)
			}
		})
	}
}

func Test_sync_OSCReceive(t *testing.T) {
	defer goleak.VerifyNone(t)

	type args struct {
		msg *osc.Message
	}

	//mock
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	smock := mock_sender.NewMockVMCSender(ctrl)

	s := sync{
		sender: smock,
		buffer: make(chan string),
	}

	tests := []struct {
		name    string
		s       sync
		args    args
		wantErr bool
		want    string
		noSend  bool
	}{
		{
			name: "success",
			s:    s,
			args: args{
				msg: &osc.Message{
					Address: "/VMC/Ext/Bone/Pos",
					Arguments: []interface{}{
						"Hips 0.07604961 0.6687986 0.052883424 0.08763669 -0.030529803 -0.026431516 0.99533373",
					},
				},
			},
			want: "/VMC/Ext/Bone/Pos Hips 0.07604961 0.6687986 0.052883424 0.08763669 -0.030529803 -0.026431516 0.99533373",
		},
		{
			name: "failure",
			s:    s,
			args: args{
				msg: &osc.Message{
					Address: "/VMC/Ext/Hmd/Pos",
					Arguments: []interface{}{
						"1.0",
					},
				},
			},
			noSend: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())

			defer func() {
				// selectで、cancelの前にSendが呼ばれるように
				time.Sleep(10 * time.Millisecond)
				cancel()
			}()

			if !tt.noSend {
				smock.EXPECT().Send(gomock.Any(), tt.want).Return(nil)
			}

			go tt.s.Run(ctx)

			if err := tt.s.OSCReceive(tt.args.msg); (err != nil) != tt.wantErr {
				t.Errorf("sync.OSCReceive() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func Test_sync_OSCBundleReceive(t *testing.T) {
	defer goleak.VerifyNone(t)

	type args struct {
		msgs []*osc.Message
	}

	//mock
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	smock := mock_sender.NewMockVMCSender(ctrl)

	s := sync{
		sender: smock,
		buffer: make(chan string),
	}

	tests := []struct {
		name    string
		s       sync
		args    args
		want    string
		wantErr bool
		noSend  bool
	}{
		// 期待されたメッセージを作成できているかチェックする
		{
			name: "success",
			s:    s,
			args: args{
				msgs: []*osc.Message{
					{
						Address: "/VMC/Ext/Bone/Pos",
						Arguments: []interface{}{
							"Hips 0.07604961 0.6687986 0.052883424 0.08763669 -0.030529803 -0.026431516 0.99533373",
						},
					},
				},
			},
			want: "/VMC/Ext/Bone/Pos Hips 0.07604961 0.6687986 0.052883424 0.08763669 -0.030529803 -0.026431516 0.99533373",
		},
		{
			name: "multi send success",
			s:    s,
			args: args{
				msgs: []*osc.Message{
					{
						Address: "/VMC/Ext/Bone/Pos",
						Arguments: []interface{}{
							"Hips 0.07604961 0.6687986 0.052883424 0.08763669 -0.030529803 -0.026431516 0.99533373",
						},
					},
					{
						Address: "/VMC/Ext/Bone/Pos",
						Arguments: []interface{}{
							"Head -1.7554687e-08 0.06544495 0.0006921813 -0.20436357 -0.025584389 0.036121413 0.97789377",
						},
					},
				},
			},
			want: "/VMC/Ext/Bone/Pos Hips 0.07604961 0.6687986 0.052883424 0.08763669 -0.030529803 -0.026431516 0.99533373\n" +
				" Head -1.7554687e-08 0.06544495 0.0006921813 -0.20436357 -0.025584389 0.036121413 0.97789377",
		},
		{
			name: "failure",
			s:    s,
			args: args{
				msgs: []*osc.Message{
					{
						Address: "/VMC/Ext/Hmd/Pos",
						Arguments: []interface{}{
							"1.0",
						},
					},
				},
			},
			noSend: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())

			defer func() {
				// selectで、cancelの前にSendが呼ばれるように
				time.Sleep(10 * time.Millisecond)
				cancel()
			}()

			if !tt.noSend {
				smock.EXPECT().Send(gomock.Any(), tt.want).Return(nil)
			}

			go tt.s.Run(ctx)

			if err := tt.s.OSCBundleReceive(tt.args.msgs); (err != nil) != tt.wantErr {
				t.Errorf("sync.OSCBundleReceive() error = %v, wantErr %v", err, tt.wantErr)
			}

		})
	}
}
