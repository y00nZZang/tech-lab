package lab;
import org.springframework.stereotype.Service;
import lab.v1.Lab;
@Service
public class EchoLogic {
    public Lab.EchoReply echo(String text) {
        return Lab.EchoReply.newBuilder().setText(text).setSequence(1).build();
    }
    public Lab.EchoReply message(int sequence) {
        return Lab.EchoReply.newBuilder().setText("message " + sequence).setSequence(sequence).build();
    }
}
