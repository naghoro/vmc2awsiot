package sender

import "context"

type VMCSender interface {
	Send(context.Context, string) error
}
