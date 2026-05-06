/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import {
  Button,
  Dropdown,
  Popover,
  Progress,
  Space,
  Tag,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import { IconMore } from '@douyinfe/semi-icons';
import {
  isRoot,
  renderGroup,
  renderNumber,
  renderQuota,
} from '../../../helpers';

const renderRole = (role) => {
  switch (role) {
    case 1:
      return <Tag color='blue'>普通用户</Tag>;
    case 10:
      return <Tag color='yellow'>管理员</Tag>;
    case 100:
      return <Tag color='orange'>超级管理员</Tag>;
    default:
      return <Tag color='red'>未知身份</Tag>;
  }
};

const renderUsername = (text, record) => {
  if (!record.remark) {
    return <span>{text}</span>;
  }
  return (
    <Space spacing={4}>
      <span>{text}</span>
      <Tooltip content={record.remark}>
        <Tag color='white' size='small'>
          {record.remark}
        </Tag>
      </Tooltip>
    </Space>
  );
};

const renderStatistics = (record) => {
  const isDeleted = record.DeletedAt !== null;
  let color = 'grey';
  let text = '未知状态';
  if (isDeleted) {
    color = 'red';
    text = '已注销';
  } else if (record.status === 1) {
    color = 'green';
    text = '已启用';
  } else if (record.status === 2) {
    color = 'red';
    text = '已禁用';
  }
  return (
    <Tooltip content={`调用次数: ${renderNumber(record.request_count)}`}>
      <Tag color={color}>{text}</Tag>
    </Tooltip>
  );
};

const renderQuotaUsage = (record) => {
  const { Paragraph } = Typography;
  const used = parseInt(record.used_quota) || 0;
  const remain = parseInt(record.quota) || 0;
  const total = used + remain;
  const percent = total > 0 ? (remain / total) * 100 : 0;

  return (
    <Popover
      content={
        <div className='text-xs p-2'>
          <Paragraph>{`已用额度: ${renderQuota(used)}`}</Paragraph>
          <Paragraph>{`剩余额度: ${renderQuota(remain)}`}</Paragraph>
          <Paragraph>{`总额度: ${renderQuota(total)}`}</Paragraph>
        </div>
      }
    >
      <Tag color='white'>
        <div className='flex flex-col items-end'>
          <span className='text-xs'>{`${renderQuota(remain)} / ${renderQuota(total)}`}</span>
          <Progress
            percent={percent}
            format={() => `${percent.toFixed(0)}%`}
            style={{ width: '100%' }}
          />
        </div>
      </Tag>
    </Popover>
  );
};

const renderInviteInfo = (record) => (
  <Space spacing={4} wrap>
    <Tag color='white'>{`邀请: ${renderNumber(record.aff_count)}`}</Tag>
    <Tag color='white'>{`累计收益: ${renderQuota(record.aff_history_quota)}`}</Tag>
    <Tag color='white'>
      {record.inviter_id === 0 ? '无上级' : `上级用户 ID: ${record.inviter_id}`}
    </Tag>
  </Space>
);

const renderOperations = (
  record,
  {
    setEditingUser,
    setShowEditUser,
    showPromoteModal,
    showDemoteModal,
    showEnableDisableModal,
    showDeleteModal,
    showResetPasskeyModal,
    showResetTwoFAModal,
    showUserSubscriptionsModal,
    showReferralRelationModal,
  },
) => {
  if (record.DeletedAt !== null) return <></>;

  const moreMenu = [
    {
      node: 'item',
      name: '订阅管理',
      onClick: () => showUserSubscriptionsModal(record),
    },
    ...(isRoot()
      ? [
          {
            node: 'item',
            name: '上下级关系',
            onClick: () => showReferralRelationModal(record),
          },
        ]
      : []),
    { node: 'divider' },
    {
      node: 'item',
      name: '重置 Passkey',
      onClick: () => showResetPasskeyModal(record),
    },
    {
      node: 'item',
      name: '重置 2FA',
      onClick: () => showResetTwoFAModal(record),
    },
    { node: 'divider' },
    {
      node: 'item',
      name: '注销',
      type: 'danger',
      onClick: () => showDeleteModal(record),
    },
  ];

  return (
    <Space>
      {record.status === 1 ? (
        <Button
          type='danger'
          size='small'
          onClick={() => showEnableDisableModal(record, 'disable')}
        >
          禁用
        </Button>
      ) : (
        <Button
          size='small'
          onClick={() => showEnableDisableModal(record, 'enable')}
        >
          启用
        </Button>
      )}
      <Button
        type='tertiary'
        size='small'
        onClick={() => {
          setEditingUser(record);
          setShowEditUser(true);
        }}
      >
        编辑
      </Button>
      <Button
        type='warning'
        size='small'
        onClick={() => showPromoteModal(record)}
      >
        提升
      </Button>
      <Button
        type='secondary'
        size='small'
        onClick={() => showDemoteModal(record)}
      >
        降级
      </Button>
      <Dropdown menu={moreMenu} trigger='click' position='bottomRight'>
        <Button type='tertiary' size='small' icon={<IconMore />} />
      </Dropdown>
    </Space>
  );
};

export const getUsersColumns = ({
  setEditingUser,
  setShowEditUser,
  showPromoteModal,
  showDemoteModal,
  showEnableDisableModal,
  showDeleteModal,
  showResetPasskeyModal,
  showResetTwoFAModal,
  showUserSubscriptionsModal,
  showReferralRelationModal,
}) => [
  { title: 'ID', dataIndex: 'id' },
  {
    title: '用户名',
    dataIndex: 'username',
    render: (text, record) => renderUsername(text, record),
  },
  {
    title: '状态',
    dataIndex: 'info',
    render: (_, record) => renderStatistics(record),
  },
  {
    title: '剩余额度/总额度',
    key: 'quota_usage',
    render: (_, record) => renderQuotaUsage(record),
  },
  {
    title: '分组',
    dataIndex: 'group',
    render: (text) => <div>{renderGroup(text)}</div>,
  },
  {
    title: '角色',
    dataIndex: 'role',
    render: (text) => <div>{renderRole(text)}</div>,
  },
  {
    title: '邀请信息',
    dataIndex: 'invite',
    render: (_, record) => renderInviteInfo(record),
  },
  {
    title: '',
    dataIndex: 'operate',
    fixed: 'right',
    width: 220,
    render: (_, record) =>
      renderOperations(record, {
        setEditingUser,
        setShowEditUser,
        showPromoteModal,
        showDemoteModal,
        showEnableDisableModal,
        showDeleteModal,
        showResetPasskeyModal,
        showResetTwoFAModal,
        showUserSubscriptionsModal,
        showReferralRelationModal,
      }),
  },
];
