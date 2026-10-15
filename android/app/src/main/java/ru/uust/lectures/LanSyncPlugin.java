package ru.uust.lectures;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

@CapacitorPlugin(name = "LanSync")
public class LanSyncPlugin extends Plugin {
    private static final String GROUP="239.255.77.77", SERVICE="uust-diary-lan-v2";
    private static final int PORT=47777, LIMIT=200*1024*1024;
    private final String deviceId=UUID.randomUUID().toString();
    private final String deviceName=Build.MANUFACTURER+" "+Build.MODEL;
    private final ConcurrentHashMap<String,Peer> peers=new ConcurrentHashMap<>();
    private final ExecutorService commands=Executors.newCachedThreadPool();
    private final Set<Socket> connections=ConcurrentHashMap.newKeySet();
    private final Semaphore connectionSlots=new Semaphore(2);
    private final ExecutorService receivers=Executors.newFixedThreadPool(2);
    private volatile ServerSocket server;
    private volatile MulticastSocket udp;
    private volatile ScheduledExecutorService timer;
    private volatile int count;
    private WifiManager.MulticastLock multicastLock;
    private volatile Incoming incoming;
    private final Object incomingLock=new Object();
    private static class Peer {
        String id,name,address; int port,count; long seen;
    }
    private static class Incoming {
        String id=UUID.randomUUID().toString(),name,address; int count;
        volatile String phase="loading"; volatile long expires=0;
        volatile JSONObject payload; volatile boolean accepted=false;
        CountDownLatch decision=new CountDownLatch(1);
    }
    @PluginMethod
    public void execute(PluginCall call) {
        commands.execute(()->{
            try {
                String action=call.getString("action","");
                JSObject result=new JSObject();
                switch(action) {
                    case "start": start(call.getInt("count",0)); result.put("id",deviceId);result.put("name",deviceName);break;
                    case "stop": stop(); break;
                    case "list":
                        count=call.getInt("count",0);
                        JSONArray list=new JSONArray();
                        for(Peer p:peers.values()) if(System.currentTimeMillis()-p.seen<10000)
                            list.put(new JSONObject().put("id",p.id).put("name",p.name).put("count",p.count));
                        result.put("devices",list);break;
                    case "pending":
                        Incoming pending=incoming;
                        if(pending!=null&&("offer".equals(pending.phase)||"data".equals(pending.phase))) {
                            result.put("id",pending.id);result.put("name",pending.name);result.put("phase",pending.phase);
                            result.put("count",pending.count);result.put("payload",pending.payload);
                        }
                        break;
                    case "decide":
                        Incoming request=incoming;
                        if(request!=null&&request.id.equals(call.getString("id"))) {
                            request.accepted=Boolean.TRUE.equals(call.getBoolean("accepted",false));
                            request.decision.countDown();
                        }
                        break;
                    case "send": result=send(call);break;
                    default: throw new IOException("Неизвестная операция");
                }
                call.resolve(result);
            } catch(Exception error) {call.reject(error.getMessage(),error);}
        });
    }
    private synchronized void start(int total) throws Exception {
        count=total;
        if(server!=null)return;
        try {
            WifiManager wifi=(WifiManager)getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if(wifi!=null) {
                multicastLock=wifi.createMulticastLock("uust-diary-discovery");
                multicastLock.setReferenceCounted(false);multicastLock.acquire();
            }
            ServerSocket listener=new ServerSocket(0);
            server=listener;
            MulticastSocket discovery=new MulticastSocket(null);
            udp=discovery;
            discovery.setReuseAddress(true);discovery.bind(new InetSocketAddress(PORT));
            discovery.setTimeToLive(1);
            boolean joined=false;
            Enumeration<NetworkInterface> interfaces=NetworkInterface.getNetworkInterfaces();
            while(interfaces.hasMoreElements()) {
                NetworkInterface nic=interfaces.nextElement();
                if(!nic.isUp()||nic.isLoopback()||!nic.supportsMulticast())continue;
                try {discovery.joinGroup(new InetSocketAddress(GROUP,PORT),nic);joined=true;}catch(Exception ignored){}
            }
            if(!joined)throw new IOException("Нет доступной сети для обнаружения устройств");
            udp=discovery;
            commands.execute(()->listen(discovery));
            commands.execute(()->{
                while(!listener.isClosed()) {
                    try {
                        Socket client=listener.accept();client.setSoTimeout(180000);
                        if(!connectionSlots.tryAcquire()){client.close();continue;}
                        connections.add(client);
                        receivers.execute(()->{try{receive(client);}finally{connections.remove(client);connectionSlots.release();}});
                    } catch(Exception ignored){if(listener.isClosed())break;}
                }
            });
            timer=Executors.newSingleThreadScheduledExecutor();
            timer.scheduleAtFixedRate(this::announce,0,2,TimeUnit.SECONDS);
        } catch(Exception error) {stop();throw error;}
    }
    private void announce() {
        MulticastSocket socket=udp;ServerSocket listener=server;
        if(socket==null||listener==null)return;
        try {
            Incoming pending=incoming;
            if(pending!=null&&"waiting".equals(pending.phase)&&System.currentTimeMillis()>pending.expires)incoming=null;
            byte[] bytes=new JSONObject().put("service",SERVICE).put("id",deviceId).put("name",deviceName)
                .put("count",count).put("port",listener.getLocalPort()).toString().getBytes(StandardCharsets.UTF_8);
            Enumeration<NetworkInterface> interfaces=NetworkInterface.getNetworkInterfaces();
            while(interfaces.hasMoreElements()) {
                NetworkInterface nic=interfaces.nextElement();
                if(nic.isUp()&&!nic.isLoopback()&&nic.supportsMulticast()) {
                    try {socket.setNetworkInterface(nic);socket.send(new DatagramPacket(bytes,bytes.length,InetAddress.getByName(GROUP),PORT));}catch(Exception ignored){}
                }
            }
        }catch(Exception ignored){}
    }
    private void listen(MulticastSocket socket) {
        while(!socket.isClosed()) {
            try {
                byte[] bytes=new byte[4096];DatagramPacket packet=new DatagramPacket(bytes,bytes.length);socket.receive(packet);
                JSONObject info=new JSONObject(new String(bytes,0,packet.getLength(),StandardCharsets.UTF_8));
                String id=info.getString("id");
                if(!SERVICE.equals(info.optString("service"))||id.equals(deviceId)||id.length()>100||!(packet.getAddress() instanceof Inet4Address))continue;
                int port=info.getInt("port"),total=info.getInt("count");
                if(port<1||port>65535||total<0)continue;
                Peer p=new Peer();p.id=id;p.name=info.getString("name");if(p.name.length()>100)p.name=p.name.substring(0,100);
                p.port=port;p.count=total;p.address=packet.getAddress().getHostAddress();p.seen=System.currentTimeMillis();
                peers.put(id,p);
            }catch(Exception ignored){if(socket.isClosed())break;}
        }
    }
    private void validate(JSONObject payload) throws Exception {
        if(payload==null||!"uust-diary-sync-v1".equals(payload.optString("format")))throw new IOException("Неверный формат");
        JSONObject data=payload.getJSONObject("data");
        for(String key:new String[]{"subjects","lectures","homeworks","exams"})data.getJSONArray(key);
        payload.getJSONObject("schedule").getJSONArray("groups");
    }
    private String line(InputStream input) throws IOException {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        int b;
        while((b=input.read())!=-1) {
            if(b=='\n')break;
            if(bytes.size()>8192)throw new IOException("Слишком длинный заголовок");
            if(b!='\r')bytes.write(b);
        }
        return bytes.toString("UTF-8");
    }
    private void receive(Socket client) {
        Incoming slot=null;
        boolean keepWaiting=false;
        try {
            InputStream input=new BufferedInputStream(client.getInputStream());
            String first=line(input);
            boolean offer=first.startsWith("POST /offer HTTP/");
            if(!offer&&!first.startsWith("POST /sync HTTP/")){respond(client,404,new JSONObject());return;}
            synchronized(incomingLock) {
                if(offer) {
                    if(incoming!=null){respond(client,409,new JSONObject());return;}
                    slot=new Incoming();slot.address=client.getInetAddress().getHostAddress();incoming=slot;
                } else {
                    if(incoming==null||!"waiting".equals(incoming.phase)||!incoming.address.equals(client.getInetAddress().getHostAddress())||System.currentTimeMillis()>incoming.expires) {
                        respond(client,403,new JSONObject());return;
                    }
                    slot=incoming;slot.phase="loading";slot.accepted=false;slot.decision=new CountDownLatch(1);
                }
            }
            int length=-1,headers=0;
            while(true) {
                String header=line(input);if(header.isEmpty())break;
                if(++headers>50)throw new IOException("Слишком много заголовков");
                int colon=header.indexOf(':');if(colon<0)throw new IOException("Неверный заголовок");
                if(header.substring(0,colon).equalsIgnoreCase("Content-Length"))length=Integer.parseInt(header.substring(colon+1).trim());
                if(header.substring(0,colon).equalsIgnoreCase("Transfer-Encoding"))throw new IOException("Нужна длина запроса");
            }
            if(length<0||length>(offer?4096:LIMIT))throw new IOException("Слишком много данных");
            byte[] data=new byte[length];int offset=0;
            while(offset<length){int read=input.read(data,offset,length-offset);if(read<0)throw new EOFException();offset+=read;}
            JSONObject envelope=new JSONObject(new String(data,StandardCharsets.UTF_8));
            if(offer) {
                slot.name=envelope.optString("name","Устройство");if(slot.name.length()>100)slot.name=slot.name.substring(0,100);
                slot.count=envelope.optInt("count",0);slot.phase="offer";
            } else {
                if(!slot.id.equals(envelope.optString("id")))throw new IOException("Запрос истёк");
                JSONObject payload=envelope.getJSONObject("payload");validate(payload);slot.payload=payload;slot.phase="data";
            }
            slot.decision.await(120,TimeUnit.SECONDS);
            if(offer&&slot.accepted) {
                slot.expires=System.currentTimeMillis()+120000;slot.phase="waiting";keepWaiting=true;
            }
            respond(client,200,new JSONObject().put("accepted",slot.accepted).put("id",slot.id));
        }catch(Exception error){keepWaiting=false;try{respond(client,400,new JSONObject().put("error","Ошибка передачи"));}catch(Exception ignored){}}
        finally {
            synchronized(incomingLock){if(!keepWaiting&&incoming==slot)incoming=null;}
            try{client.close();}catch(Exception ignored){}
        }
    }
    private void respond(Socket client,int status,JSONObject body) throws IOException {
        byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);
        OutputStream output=client.getOutputStream();
        output.write(("HTTP/1.1 "+status+" Result\r\nContent-Type: application/json\r\nContent-Length: "+bytes.length+"\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        output.write(bytes);output.flush();
    }
    private JSObject send(PluginCall call) throws Exception {
        Peer p=peers.get(call.getString("peerId",""));
        if(p==null||System.currentTimeMillis()-p.seen>10000)throw new IOException("Устройство больше не доступно");
        JSONObject payload=call.getObject("payload");validate(payload);
        JSObject consent=post(p,"/offer",new JSONObject().put("name",deviceName).put("count",call.getInt("count",0)));
        if(!consent.optBoolean("accepted"))return new JSObject().put("accepted",false);
        return post(p,"/sync",new JSONObject().put("id",consent.getString("id")).put("payload",payload));
    }
    private JSObject post(Peer p,String path,JSONObject body) throws Exception {
        byte[] data=body.toString().getBytes(StandardCharsets.UTF_8);
        if(data.length>LIMIT)throw new IOException("Слишком много данных");
        HttpURLConnection connection=(HttpURLConnection)new URL("http://"+p.address+":"+p.port+path).openConnection();
        try {
            connection.setRequestMethod("POST");connection.setConnectTimeout(10000);connection.setReadTimeout(150000);
            connection.setInstanceFollowRedirects(false);connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type","application/json");connection.setFixedLengthStreamingMode(data.length);
            try(OutputStream out=connection.getOutputStream()){out.write(data);}
            if(connection.getResponseCode()!=200)throw new IOException("Устройство занято или недоступно");
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();
            try(InputStream in=connection.getInputStream()) {
                byte[] buffer=new byte[4096];int n;
                while((n=in.read(buffer))!=-1){bytes.write(buffer,0,n);if(bytes.size()>65536)throw new IOException("Неверный ответ");}
            }
            return new JSObject(bytes.toString("UTF-8"));
        }finally{connection.disconnect();}
    }
    private synchronized void stop() {
        if(timer!=null){timer.shutdownNow();timer=null;}
        if(udp!=null){udp.close();udp=null;}
        if(server!=null){try{server.close();}catch(Exception ignored){}server=null;}
        Incoming pending=incoming;incoming=null;if(pending!=null){pending.accepted=false;pending.decision.countDown();}
        for(Socket client:connections){try{client.close();}catch(Exception ignored){}}
        connections.clear();
        peers.clear();
        if(multicastLock!=null&&multicastLock.isHeld())multicastLock.release();
        multicastLock=null;
    }
    @Override protected void handleOnDestroy() {stop();commands.shutdownNow();receivers.shutdownNow();}
}
