<script setup lang="ts">
import {computed} from 'vue'
import {Plus,Trash2} from 'lucide-vue-next'
import type {Product,RequestItemInput} from '../api'
const props=defineProps<{products:Product[]}>()
const lines=defineModel<RequestItemInput[]>({required:true})
const total=computed(()=>lines.value.reduce((sum,line)=>sum+(props.products.find(p=>p.id===line.productId)?.price||0)*Number(line.quantity),0))
const money=(n:number)=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(n)
function add(){const product=props.products.find(p=>!lines.value.some(l=>l.productId===p.id));if(product)lines.value.push({productId:product.id,quantity:1})}
</script>
<template><div class="line-editor"><div class="section-caption">采购明细<span>{{lines.length}} / 100 项</span></div><div v-for="(line,index) in lines" :key="index" class="purchase-line"><label>商品 {{index+1}}<select v-model="line.productId" :aria-label="'采购商品 '+(index+1)" required><option v-for="p in products" :key="p.id" :value="p.id" :disabled="lines.some((l,i)=>i!==index&&l.productId===p.id)">{{p.name}} · {{money(Number(p.price))}} / {{p.unit}}</option></select></label><label>数量<input v-model.number="line.quantity" :aria-label="'采购数量 '+(index+1)" type="number" min="1" max="100000" required/></label><button type="button" class="icon-button" :disabled="lines.length===1" :aria-label="'删除商品 '+(index+1)" @click="lines.splice(index,1)"><Trash2 :size="17"/></button></div><button class="btn" type="button" :disabled="lines.length>=100||lines.length>=products.length" @click="add"><Plus :size="15"/>添加商品</button><div class="purchase-total"><span>预计申请金额</span><strong>{{money(total)}}</strong></div><p class="muted small-copy">审批通过后，按供应商拆分采购订单；每项商品保留提交时的单价。</p></div></template>
