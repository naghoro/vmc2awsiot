package mqttsender

import (
	"testing"

	MQTT "github.com/eclipse/paho.mqtt.golang"
)

type MockMQTTClient struct{}

func (MockMQTTClient) Publish(topic string, qos byte, retained bool, payload interface{}) MQTT.Token {
	return nil
}

func TestMQTTSender_makeMessage(t *testing.T) {
	type args struct {
		msg string
	}
	tests := []struct {
		name    string
		p       MQTTSender
		args    args
		want    string
		want1   string
		wantErr bool
	}{
		{
			name: "success1",
			p:    MQTTSender{},
			args: args{
				msg: "/test message",
			},
			want:  "/test",
			want1: "message",
		},
		{
			name: "success2",
			p:    MQTTSender{},
			args: args{
				msg: "/test message message2",
			},
			want:  "/test",
			want1: "message message2",
		},
		{
			name: "failure",
			p:    MQTTSender{},
			args: args{
				msg: "/test,message",
			},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, got1, err := tt.p.makeMessage(tt.args.msg)

			if (err != nil) != tt.wantErr {
				t.Errorf("MQTTSender.makeMessage() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if got != tt.want {
				t.Errorf("MQTTSender.makeMessage() got = %v, want %v", got, tt.want)
			}
			if got1 != tt.want1 {
				t.Errorf("MQTTSender.makeMessage() got1 = %v, want %v", got1, tt.want1)
			}
		})
	}
}
