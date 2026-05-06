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
  Button,
  Card,
  Form,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  API,
  downloadTextAsFile,
  showError,
  showSuccess,
  timestamp2string,
} from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';

const roleTag = (role, t) => {
  if (role >= 100) {
    return <Tag color='orange'>{t('超级管理员')}</Tag>;
  }
  if (role >= 10) {
    return <Tag color='yellow'>{t('管理员')}</Tag>;
  }
  return <Tag>{role}</Tag>;
};

const statusTag = (success, t) =>
  success ? (
    <Tag color='green'>{t('成功')}</Tag>
  ) : (
    <Tag color='red'>{t('失败')}</Tag>
  );

const dateToUnix = (value) => {
  if (!value) {
    return '';
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return '';
  }
  return Math.floor(timestamp / 1000);
};

const buildFilterParams = (filters, page, size) => {
  const params = {
    p: page,
    page_size: size,
  };
  if (filters.operator) params.operator = filters.operator;
  if (filters.action) params.action = filters.action;
  if (filters.path) params.path = filters.path;
  if (filters.method) params.method = filters.method;
  if (filters.success !== '') params.success = filters.success;
  if (filters.start_timestamp) {
    params.start_timestamp = dateToUnix(filters.start_timestamp);
  }
  if (filters.end_timestamp) {
    params.end_timestamp = dateToUnix(filters.end_timestamp);
  }
  return params;
};

const defaultFilters = {
  operator: '',
  action: '',
  path: '',
  method: '',
  success: '',
  start_timestamp: '',
  end_timestamp: '',
};

const OperationLogPage = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState(defaultFilters);

  const columns = useMemo(
    () => [
      {
        title: t('时间'),
        dataIndex: 'created_at',
        render: (value) => timestamp2string(value),
      },
      {
        title: t('操作人'),
        dataIndex: 'operator_username',
        render: (_, record) => (
          <Space spacing={6}>
            <span>{record.operator_username || '-'}</span>
            {roleTag(record.operator_role, t)}
          </Space>
        ),
      },
      {
        title: t('动作'),
        dataIndex: 'action',
        render: (value) => value || '-',
      },
      {
        title: t('请求'),
        dataIndex: 'method',
        render: (_, record) => (
          <Space vertical align='start' spacing={4}>
            <Tag color='blue'>{record.method}</Tag>
            <span className='break-all text-xs'>{record.path}</span>
            {record.query ? (
              <span className='break-all text-xs text-gray-500'>
                ?{record.query}
              </span>
            ) : null}
          </Space>
        ),
      },
      {
        title: t('结果'),
        dataIndex: 'success',
        render: (_, record) => (
          <Space spacing={6}>
            {statusTag(record.success, t)}
            <Tag color='white'>{record.status_code}</Tag>
          </Space>
        ),
      },
      {
        title: t('摘要'),
        dataIndex: 'request_summary',
        render: (_, record) => (
          <div className='max-w-[520px]'>
            {record.message ? (
              <div className='text-xs mb-1 break-all'>{record.message}</div>
            ) : null}
            {record.request_summary ? (
              <pre className='m-0 text-xs whitespace-pre-wrap break-all bg-gray-50 p-2 rounded-md'>
                {record.request_summary}
              </pre>
            ) : (
              <span className='text-xs text-gray-400'>-</span>
            )}
          </div>
        ),
      },
      {
        title: t('其他'),
        dataIndex: 'duration_ms',
        render: (_, record) => (
          <Space vertical align='start' spacing={2}>
            <span className='text-xs'>
              {t('耗时')}: {record.duration_ms}ms
            </span>
            <span className='text-xs break-all'>IP: {record.ip || '-'}</span>
            <span className='text-xs break-all'>
              RID: {record.request_id || '-'}
            </span>
          </Space>
        ),
      },
    ],
    [t],
  );

  const loadLogs = async (
    page = activePage,
    size = pageSize,
    nextFilters = filters,
  ) => {
    setLoading(true);
    try {
      const res = await API.get('/api/operation_logs/', {
        params: buildFilterParams(nextFilters, page, size),
      });
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        return;
      }
      setLogs((data.items || []).map((item) => ({ ...item, key: item.id })));
      setActivePage(data.page);
      setTotal(data.total);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const exportLogs = async () => {
    setExporting(true);
    try {
      const res = await API.get('/api/operation_logs/export', {
        params: {
          ...buildFilterParams(filters, 1, pageSize),
          limit: 10000,
        },
        transformResponse: [(data) => data],
      });
      if (!res.data) {
        showError(t('导出日志失败'));
        return;
      }
      const fileName = `operation-logs-${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, '-')}.csv`;
      downloadTextAsFile(res.data, fileName);
      showSuccess(t('日志导出成功'));
    } catch (error) {
      showError(t('导出日志失败'));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    loadLogs(1, pageSize, filters);
  }, []);

  return (
    <div className='mt-[60px] px-2'>
      <Card
        title={t('操作日志')}
        headerExtraContent={
          <Space spacing={8}>
            <Button onClick={() => loadLogs(activePage, pageSize, filters)}>
              {t('刷新')}
            </Button>
            <Button loading={exporting} onClick={exportLogs}>
              {t('导出')}
            </Button>
          </Space>
        }
      >
        <Form
          layout='horizontal'
          initValues={filters}
          onValueChange={(values) =>
            setFilters((prev) => ({ ...prev, ...values }))
          }
        >
          <div className='grid grid-cols-1 md:grid-cols-4 gap-3 mb-3'>
            <Form.Input field='operator' label={t('操作人')} />
            <Form.Input field='action' label={t('动作')} />
            <Form.Input field='path' label={t('路径包含')} />
            <Form.Select field='method' label={t('请求方法')}>
              <Select.Option value=''>{t('全部')}</Select.Option>
              <Select.Option value='POST'>POST</Select.Option>
              <Select.Option value='PUT'>PUT</Select.Option>
              <Select.Option value='PATCH'>PATCH</Select.Option>
              <Select.Option value='DELETE'>DELETE</Select.Option>
            </Form.Select>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-3 mb-4'>
            <Form.DatePicker
              field='start_timestamp'
              label={t('起始时间')}
              type='dateTime'
              initValue={filters.start_timestamp}
              value={filters.start_timestamp}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, start_timestamp: value }))
              }
            />
            <Form.DatePicker
              field='end_timestamp'
              label={t('结束时间')}
              type='dateTime'
              initValue={filters.end_timestamp}
              value={filters.end_timestamp}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, end_timestamp: value }))
              }
            />
            <Form.Select field='success' label={t('结果')}>
              <Select.Option value=''>{t('全部')}</Select.Option>
              <Select.Option value='true'>{t('成功')}</Select.Option>
              <Select.Option value='false'>{t('失败')}</Select.Option>
            </Form.Select>
          </div>

          <Space spacing={8} className='mb-4'>
            <Button
              theme='solid'
              onClick={() => {
                setActivePage(1);
                loadLogs(1, pageSize, filters);
              }}
            >
              {t('搜索')}
            </Button>
            <Button
              onClick={() => {
                setFilters(defaultFilters);
                loadLogs(1, pageSize, defaultFilters);
              }}
            >
              {t('重置')}
            </Button>
          </Space>
        </Form>

        <Table
          columns={columns}
          dataSource={logs}
          loading={loading}
          pagination={false}
        />

        <div className='flex justify-end mt-4'>
          <Pagination
            currentPage={activePage}
            pageSize={pageSize}
            total={total}
            pageSizeOpts={[10, 20, 50, 100]}
            onPageChange={(page) => loadLogs(page, pageSize, filters)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              loadLogs(1, size, filters);
            }}
          />
        </div>
      </Card>
    </div>
  );
};

export default OperationLogPage;
