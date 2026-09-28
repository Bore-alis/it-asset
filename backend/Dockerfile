# 빌드는 호스트(또는 CI)에서 ./gradlew build 로 끝낸 뒤 jar 만 담는다.
# 운영 배포 스크립트도 이 경로(build/libs)를 기준으로 jar 를 배치한다.
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY build/libs/*SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
