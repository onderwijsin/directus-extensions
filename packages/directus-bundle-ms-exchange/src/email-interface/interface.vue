<template>
	<VNotice v-if="!isCreate && !data.length" :type="type" :icon="pending ? 'autorenew' : undefined">
		{{ label }}
	</VNotice>
	<VList v-else :mandatory="false">
		<VListGroup 
			v-for="email in data" 
			:key="email.id"
		>
			<template #activator>
				<VListItem dense style="display: flex; align-items: center; gap: 1rem;">
					<VChip x-small style="flex-shrink: 0;">
						{{ email.prettySentDate }}
					</VChip>
					<span class="sm-text bold no-wrap" style="flex-grow: 1;">
						{{ email.subject }}
					</span>
					<div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
						<VIcon :name="email.isRead ? 'visibility' : 'visibility_off'" small style="opacity: 0.6;" />
						<VIcon v-if="email.hasAttachments" name="attachment" small style="opacity: 0.6;" />
					</div>
					
				</VListItem>
			</template>
			<VListItem>
				<div class="sm-text" style="margin: 10px 0 6px; line-height: 2" v-html="email.bodyPreview" />
			</VListItem>
			<VListItem style="font-style: italic; margin-bottom: 10px; font-size: 10px; display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem 1.5rem;">
				<span style="display: flex; align-items: center; gap: 4px;">
					<VIcon name="outgoing_mail" small style="position: relative; top: 1px;"/>
					<span>{{ email.from.emailAddress.name }} <<a :href="'mailto:' + email.from.emailAddress.address" target="_blank" style="text-decoration: underline; color: var(--project-color)">{{ email.from.emailAddress.address }}</a>></span>
				</span>
				<span 
					v-for="(recipient, i) in email.toRecipients"
					style="display: flex; align-items: center; gap: 4px;"
					:style="i > 2 ? 'display: none' : ''"
				>
					<VIcon name="move_to_inbox" small style=""/>
					<span>{{ recipient.emailAddress.name }} <<a :href="'mailto:' + recipient.emailAddress.address" target="_blank" style="text-decoration: underline; color: var(--project-color)">{{ recipient.emailAddress.address }}</a>></span>
				</span>
			</VListItem>
			<VButton small secondary :href="email.webLink" target="_blank" style="margin-bottom: 16px;">
				<span>View in outlook</span>
				<VIcon name="arrow_outward" small style="margin-left: 1rem;" />
			</VButton>

		</VListGroup>
	</VList>
</template>

<script lang="ts">
import { defineComponent, computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

type FormattedEmail = Email & {
	prettySentDate: string;
}

export default defineComponent({
	props: {
		email_field: {
			type: String,
		},
		primaryKey: {
			type: [String, Number],
			required: true
		},
	},
	setup(props,  { attrs }) {
		console.log(attrs)
		const { collection } = attrs;
		const api = useApi();

		const email = ref('')
		const pending = ref(true)
		const error: Ref<any> = ref(null)
		async function fetchEmailValue() {
			if (!props.email_field || isCreate.value) return;
			pending.value = true
			try {
				const response = await api.get(`/items/${collection}/${props.primaryKey}`);
				email.value = response.data.data[props.email_field];
				return ;
			} catch (err) {
				error.value = err;
				pending.value = false
				console.warn(err);
			}
		}

		const label = computed(() => {
			if (!email.value) {
				return 'No email address provided';
			}
			if (pending.value) return 'Searching for email history...';
			return `Emails will be rendered here!`
		})

		const type = computed(() => {
			if (!props.email_field) return 'warning'
			return 'info'
		})

		const isCreate = computed(() => props.primaryKey === '+')


		watch(() => props.primaryKey, fetchEmailValue)


		const data: Ref<FormattedEmail[]> = ref([])

		async function fetchEmails() {
			if (!email.value) return;
			pending.value = true
			try {
				const response: { data: Email[] } = await api.post(`/server/ms-exchange/emails`, {
					email: email.value
				});

				data.value = formatData(response.data);
				pending.value = false
				return ;
			} catch (err) {
				error.value = err;
				pending.value = false
				console.warn(err);
			}
		}

		watch(email, fetchEmails)

		const formatData = (data: Email[]) => {
			return data.map((email) => {
				return {
					...email,
					prettySentDate: format(new Date(email.sentDateTime), 'HH:mm dd/MM/yy', { locale: nl })
				}
			})
		}


		return { data, pending, error, label, type, isCreate }
	},
});
</script>

<style scoped>
.sm-text {
	font-size: 12px; line-clamp: 1;
}

.no-wrap {
	white-space: nowrap;
	overflow: hidden;
  	text-overflow: ellipsis;
}

.bold {
	font-weight: 700;
}
</style>
