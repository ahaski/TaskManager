// No authenticated API responses or user data are cached by the service worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
 let payload;try { payload=event.data?.json(); } catch { return; }
 if(!payload)return;
 event.waitUntil(self.registration.showNotification(payload.title||'מסלול', {body:payload.body||'הגיע הזמן למשימה שלך',icon:'/icon-192.png',badge:'/icon-192.png',tag:payload.tag||'maslul',data:{taskId:payload.taskId}}));
});
self.addEventListener('notificationclick', event => {
 event.notification.close();
 const target=new URL('/',self.location.origin);if(event.notification.data?.taskId)target.searchParams.set('task',event.notification.data.taskId);
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const client=clients.find(c=>c.url.startsWith(self.location.origin));if(client){await client.navigate(target.href);return client.focus();}return self.clients.openWindow(target.href);}));
});
