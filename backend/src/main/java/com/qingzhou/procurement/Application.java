package com.qingzhou.procurement;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling
public class Application {
    public static void main(String[] args) throws Exception {
        if(args.length==1&&args[0].startsWith("--verify-backup-db=")) {
            String path=args[0].substring("--verify-backup-db=".length());
            BackupProbe.verify(path,System.getenv().getOrDefault("DB_USER","sa"),System.getenv().getOrDefault("DB_PASSWORD",""));
            System.out.println("Backup database validation passed.");
            return;
        }
        SpringApplication.run(Application.class, args);
    }
}
