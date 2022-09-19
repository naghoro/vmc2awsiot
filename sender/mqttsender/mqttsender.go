package mqttsender

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io/ioutil"
	"strings"
	"vmc2awsiot"

	MQTT "github.com/eclipse/paho.mqtt.golang"
	"go.uber.org/zap"
)

func NewTLSConfig() *tls.Config {
	// Import trusted certificates from CAfile.pem.
	// Alternatively, manually add CA certificates to
	// default openssl CA bundle.
	certpool := x509.NewCertPool()
	pemCerts, err := ioutil.ReadFile(vmc2awsiot.IOT_CA)
	if err != nil {
		panic(err)
	}

	certpool.AppendCertsFromPEM(pemCerts)

	// Import client certificate/key pair
	cert, err := tls.LoadX509KeyPair(vmc2awsiot.IOT_CLIENTCERT, vmc2awsiot.IOT_CLIENTKEY)
	if err != nil {
		panic(err)
	}

	// Just to print out the client certificate..
	cert.Leaf, err = x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		panic(err)
	}
	fmt.Println(cert.Leaf)

	// Create tls.Config with desired tls properties
	return &tls.Config{
		// RootCAs = certs used to verify server cert.
		RootCAs: certpool,
		// ClientAuth = whether to request cert from server.
		// Since the server is set up for SSL, this happens
		// anyways.
		// ClientAuth: tls.NoClientCert,
		// ClientCAs = certs used to validate client cert.
		// ClientCAs: nil,
		// InsecureSkipVerify = verify that cert contents
		// match server. IP matches what is in cert etc.
		InsecureSkipVerify: true,
		// Certificates = list of certs client sends to server.
		Certificates: []tls.Certificate{cert},

		// 443でコネクション貼る場合は必要
		// NextProtos: []string{"x-amzn-mqtt-ca"},
	}
}

type MQTTSender struct {
	client MQTT.Client
}

func NewMQTTSender() *MQTTSender {
	tlsconfig := NewTLSConfig()

	opts := MQTT.NewClientOptions()
	opts.AddBroker(fmt.Sprintf("ssl://%s:8883", vmc2awsiot.IOT_ENDPOINT))
	opts.SetClientID(vmc2awsiot.IOT_CLIENT_ID).SetTLSConfig(tlsconfig)

	return &MQTTSender{
		client: MQTT.NewClient(opts),
	}
}

func (p MQTTSender) Open() error {
	zap.L().Debug("connect start")

	if token := p.client.Connect(); token.Wait() && token.Error() != nil {
		return token.Error()
	}

	zap.L().Debug("connect end")

	return nil
}

func (p MQTTSender) Close() {
	p.client.Disconnect(250)
}

func (p MQTTSender) Send(ctx context.Context, msg string) error {
	req := strings.SplitN(msg, " ", 2)

	zap.L().Debug("in send", zap.Any("req", req))

	if len(req) != 2 {
		return fmt.Errorf("request is not valid: %s %+v", msg, req)
	}

	// TODO: エラー処理入れる？
	zap.L().Debug("publish", zap.Any("req", req))
	p.client.Publish(req[0], 1, false, req[1])

	return nil
}
