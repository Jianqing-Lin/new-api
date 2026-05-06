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

import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Empty,
  SideSheet,
  Space,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import CardTable from '../../../common/ui/CardTable';
import { API, renderQuota, showError } from '../../../../helpers';

const { Text } = Typography;

const UserReferralRelationModal = ({ visible, onCancel, user, t }) => {
  const [loading, setLoading] = useState(false);
  const [relation, setRelation] = useState(null);

  const loadRelation = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await API.get(`/api/user/${user.id}/referral_relation`);
      if (res.data?.success) {
        setRelation(res.data.data || null);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch (error) {
      showError(
        error.response?.data?.message || error.message || t('加载失败'),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadRelation();
    } else {
      setRelation(null);
    }
  }, [visible, user?.id]);

  const inviteeColumns = useMemo(
    () => [
      { title: 'ID', dataIndex: 'id', width: 70 },
      { title: t('用户名'), dataIndex: 'username' },
      {
        title: t('显示名称'),
        dataIndex: 'display_name',
        render: (value) => value || '-',
      },
      {
        title: t('分组'),
        dataIndex: 'group',
        render: (value) => value || '-',
      },
      {
        title: t('累计收益'),
        dataIndex: 'aff_history_quota',
        render: (value) => renderQuota(value || 0),
      },
    ],
    [t],
  );

  const renderUserCard = (title, data) => (
    <Card className='!rounded-xl'>
      <div className='flex flex-col gap-2'>
        <Text strong>{title}</Text>
        {data ? (
          <>
            <Text>{`${t('用户名')}: ${data.username || '-'}`}</Text>
            <Text>{`${t('显示名称')}: ${data.display_name || '-'}`}</Text>
            <Text>{`${t('分组')}: ${data.group || '-'}`}</Text>
            <Text>{`ID: ${data.id}`}</Text>
            <Space spacing={6} wrap>
              <Tag color='white'>{`${t('下级数量')}: ${data.aff_count || 0}`}</Tag>
              <Tag color='white'>{`${t('待用收益')}: ${renderQuota(data.aff_quota || 0)}`}</Tag>
              <Tag color='white'>{`${t('累计收益')}: ${renderQuota(data.aff_history_quota || 0)}`}</Tag>
            </Space>
          </>
        ) : (
          <Text type='tertiary'>{t('无')}</Text>
        )}
      </div>
    </Card>
  );

  return (
    <SideSheet
      title={t('上下级关系')}
      visible={visible}
      onCancel={onCancel}
      width={900}
      closeIcon={null}
      footer={null}
    >
      <Spin spinning={loading}>
        <div className='flex flex-col gap-4 p-2'>
          {renderUserCard(t('当前用户'), relation?.user)}
          {renderUserCard(t('上级用户'), relation?.inviter)}

          <Card className='!rounded-xl'>
            <div className='flex items-center justify-between mb-3'>
              <Text strong>{t('直属下级')}</Text>
              <Tag color='blue'>{relation?.invitee_count || 0}</Tag>
            </div>
            {relation?.invitees?.length ? (
              <CardTable
                columns={inviteeColumns}
                dataSource={relation.invitees.map((item) => ({
                  ...item,
                  key: item.id,
                }))}
                pagination={false}
              />
            ) : (
              <Empty description={t('暂无数据')} />
            )}
          </Card>
        </div>
      </Spin>
    </SideSheet>
  );
};

export default UserReferralRelationModal;
