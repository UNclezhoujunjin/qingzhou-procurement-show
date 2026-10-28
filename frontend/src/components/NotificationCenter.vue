<script setup lang="ts">
import {ref,onMounted,watch} from 'vue'
import {api,post,type Inbox,type Notice} from '../api'
const emit=defineEmits<{navigate:[page:string];changed:[]}>()
const result=ref<Inbox>({items:[],total:0,unread:0,page:1,size:20}),page=ref(1),unread=ref(false),busy=ref(false),error=ref('')
async function load(){busy.value=true;error.value='';try{result.value=await api(`/notifications?page=${page.value}&size=20&unread=${unread.value}`)}catch(e){error.value=(e as Error).message}finally{busy.value=false}}
async function open(n:Notice){try{await post(`/notifications/${n.id}/read`);emit('changed');emit('navigate',n.path)}catch(e){error.value=(e as Error).message}}
async function readAll(){try{await post('/notifications/read-all');emit('changed');await load()}catch(e){error.value=(e as Error).message}}
watch(unread,()=>{page.value=1;void load()});watch(page,load);onMounted(load)
</script>
<template><section class="panel"><div class="table-toolbar"><div class="toolbar-filters"><strong>未读 {{result.unread}} 条</strong><label class="checkbox-label"><input v-model="unread" type="checkbox"/>只看未读</label></div><button class="btn" :disabled="busy||!result.unread" @click="readAll">全部标为已读</button></div><p v-if="error" class="form-error" role="alert">{{error}}</p><button v-for="n in result.items" :key="n.id" class="notification-row" :class="{unread:!n.read_at}" @click="open(n)"><span class="notice-marker"></span><div><strong>{{n.title}}</strong><p>{{n.body}}</p><small>{{n.created_at.replace('T',' ').slice(0,16)}} · {{n.read_at?'已读':'未读'}}</small></div><span class="muted">查看 →</span></button><div v-if="!result.items.length&&!busy" class="empty">{{unread?'没有未读通知。':'暂时没有通知，业务进展会在这里提醒你。'}}</div><div class="table-footer"><span>共 {{result.total}} 条通知</span><div><button class="btn compact" :disabled="page===1||busy" @click="page--">上一页</button><span>{{page}} / {{Math.max(1,Math.ceil(result.total/20))}}</span><button class="btn compact" :disabled="page*20>=result.total||busy" @click="page++">下一页</button></div></div></section></template>
