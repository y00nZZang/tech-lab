package lab;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import com.linecorp.armeria.server.Server;
import com.linecorp.armeria.server.grpc.GrpcService;
import com.linecorp.armeria.server.cors.CorsService;
import com.linecorp.armeria.common.HttpMethod;
import java.net.InetSocketAddress;

@SpringBootApplication
public class Application {
    public static void main(String[] args) { SpringApplication.run(Application.class, args); }
    @Bean(initMethod = "start", destroyMethod = "close")
    Server armeria(EchoLogic logic) {
        return Server.builder().http(new InetSocketAddress("127.0.0.1", 8093))
            .service(GrpcService.builder().addService(new EchoGrpc(logic)).build(),
                CorsService.builder("http://127.0.0.1:5178")
                    .allowRequestMethods(HttpMethod.POST, HttpMethod.OPTIONS)
                    .allowRequestHeaders("content-type", "x-grpc-web", "x-user-agent", "grpc-timeout")
                    .exposeHeaders("grpc-status", "grpc-message").newDecorator())
            .build();
    }
}
