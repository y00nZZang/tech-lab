package lab;
import org.springframework.web.bind.annotation.*;
@RestController
@CrossOrigin(origins = "http://127.0.0.1:5178")
public class EchoRest {
    private final EchoLogic logic;
    public EchoRest(EchoLogic logic) { this.logic = logic; }
    public record Request(String text) {}
    public record Reply(String text, int sequence) {}
    @PostMapping("/api/echo")
    public Reply echo(@RequestBody Request request) {
        var response = logic.echo(request.text());
        return new Reply(response.getText(), response.getSequence());
    }
}
