import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  Table,
  Input,
  Button,
  Space,
  Tag,
  Typography,
  Alert,
  App as AntApp
} from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { fetchStoredEmails } from "../api.js";

const { Text } = Typography;

export default function StoredEmails() {
  const { message } = AntApp.useApp();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (opts = {}) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchStoredEmails({
          page: opts.page ?? page,
          pageSize: opts.pageSize ?? pageSize,
          search: opts.search ?? search
        });
        setRows(data.rows);
        setTotal(data.total);
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, search]
  );

  useEffect(() => {
    load({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
    load({ page: 1, search: value });
  };

  const handleTableChange = (pagination) => {
    setPage(pagination.current);
    setPageSize(pagination.pageSize);
    load({ page: pagination.current, pageSize: pagination.pageSize });
  };

  const columns = [
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (email) => <Text copyable>{email}</Text>
    },
    {
      title: "Saved At",
      dataIndex: "created_at",
      key: "created_at",
      width: 220,
      render: (val) => (val ? new Date(val).toLocaleString() : "—")
    },
    {
      title: "Active",
      dataIndex: "active",
      key: "active",
      width: 100,
      render: (val) => <Tag color={val ? "green" : "default"}>{val ? "Yes" : "No"}</Tag>
    },
    {
      title: "Replied",
      dataIndex: "replied",
      key: "replied",
      width: 100,
      render: (val) => <Tag color={val ? "blue" : "default"}>{val ? "Yes" : "No"}</Tag>
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <Input.Search
            placeholder="Search by email…"
            allowClear
            enterButton={<SearchOutlined />}
            onSearch={handleSearch}
            style={{ maxWidth: 340 }}
          />
          <Space>
            <Tag color="purple">{total} email(s) in Supabase</Tag>
            <Button icon={<ReloadOutlined />} onClick={() => load()}>
              Refresh
            </Button>
          </Space>
        </Space>
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Could not load emails from Supabase"
          description={error}
        />
      )}

      <Card>
        <Table
          columns={columns}
          dataSource={rows.map((r) => ({ ...r, key: r.id }))}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [25, 50, 100, 200]
          }}
          onChange={handleTableChange}
          size="middle"
        />
      </Card>
    </Space>
  );
}
