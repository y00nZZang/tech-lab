package lab;
import io.grpc.Status;
import io.grpc.stub.StreamObserver;
import io.grpc.stub.ServerCallStreamObserver;
import lab.v1.Lab;
import lab.v1.EchoServiceGrpc;
import com.linecorp.armeria.server.ServiceRequestContext;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ScheduledFuture;

public class EchoGrpc extends EchoServiceGrpc.EchoServiceImplBase {
    private final EchoLogic logic;
    public EchoGrpc(EchoLogic logic) { this.logic = logic; }
    @Override public void echo(Lab.EchoRequest request, StreamObserver<Lab.EchoReply> observer) {
        observer.onNext(logic.echo(request.getText())); observer.onCompleted();
    }
    @Override public void watch(Lab.WatchRequest request, StreamObserver<Lab.EchoReply> observer) {
        var call = (ServerCallStreamObserver<Lab.EchoReply>) observer;
        int count = (int) Math.min(request.getCount() == 0 ? 5 : Integer.toUnsignedLong(request.getCount()), 20);
        long interval = Math.max(100, Math.min(request.getIntervalMs() == 0 ? 1000 : Integer.toUnsignedLong(request.getIntervalMs()), 3000));
        var sent = new AtomicInteger();
        var task = new AtomicReference<ScheduledFuture<?>>();
        call.setOnCancelHandler(() -> {
            System.out.println("ARMERIA cancelled after=" + sent.get());
            var scheduled = task.get(); if (scheduled != null) scheduled.cancel(false);
        });
        task.set(ServiceRequestContext.current().eventLoop().scheduleAtFixedRate(() -> {
            if (call.isCancelled()) { task.get().cancel(false); return; }
            int sequence = sent.incrementAndGet();
            observer.onNext(logic.message(sequence));
            System.out.println("ARMERIA send=" + sequence);
            if (request.getFailAfter() == sequence) {
                task.get().cancel(false);
                observer.onError(Status.INTERNAL.withDescription("synthetic failure").asRuntimeException());
            } else if (sequence == count) { task.get().cancel(false); observer.onCompleted(); }
        }, interval, interval, TimeUnit.MILLISECONDS));
    }
}
