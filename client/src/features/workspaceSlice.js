import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../configs/api";

export const authHeaders = async (getToken) => ({ headers: { Authorization: `Bearer ${await getToken()}` } });

const fetchWorkspaceData = async (workspaceId, config) => {
    const [projects, summary] = await Promise.all([
        api.get(`/api/workspaces/${workspaceId}/projects`, config),
        api.get(`/api/workspaces/${workspaceId}/summary`, config),
    ]);
    return { projects: projects.data.projects, summary: summary.data };
};

export const loadWorkspace = createAsyncThunk("workspace/loadWorkspace", async ({ getToken, workspaceId }) => {
    const config = await authHeaders(getToken);
    const [detail, data] = await Promise.all([api.get(`/api/workspaces/${workspaceId}`, config), fetchWorkspaceData(workspaceId, config)]);
    localStorage.setItem("currentWorkspaceId", workspaceId);
    return { workspace: { ...detail.data.workspace, role: detail.data.role }, ...data };
});

export const fetchWorkspaces = createAsyncThunk("workspace/fetchWorkspaces", async ({ getToken }, { dispatch }) => {
    const { data } = await api.get("/api/workspaces", await authHeaders(getToken));
    const workspaces = data.workspaces || [];
    const savedId = localStorage.getItem("currentWorkspaceId");
    const current = workspaces.find((w) => w.id === savedId) ?? workspaces[0];
    if (current) await dispatch(loadWorkspace({ getToken, workspaceId: current.id }));
    return workspaces;
});

// After any change (ours or, via the workspace room, anyone else's), reload what it can affect instead of patching locally
export const refreshWorkspace = createAsyncThunk("workspace/refreshWorkspace", async ({ getToken }, { getState }) => {
    const workspaceId = getState().workspace.currentWorkspace?.id;
    if (!workspaceId) return null;
    const config = await authHeaders(getToken);
    const [detail, data] = await Promise.all([api.get(`/api/workspaces/${workspaceId}`, config), fetchWorkspaceData(workspaceId, config)]);
    return { workspace: { ...detail.data.workspace, role: detail.data.role }, ...data };
});

const initialState = {
    workspaces: [],
    currentWorkspace: null,
    projects: [],
    summary: null,
    loading: false,
};

const workspaceSlice = createSlice({
    name: "workspace",
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder.addCase(fetchWorkspaces.pending, (state) => {
            state.loading = true;
        });
        builder.addCase(fetchWorkspaces.fulfilled, (state, action) => {
            state.workspaces = action.payload;
            state.loading = false;
        });
        builder.addCase(fetchWorkspaces.rejected, (state) => {
            state.workspaces = [];
            state.loading = false;
        });
        builder.addCase(loadWorkspace.fulfilled, (state, action) => {
            state.currentWorkspace = action.payload.workspace;
            state.projects = action.payload.projects;
            state.summary = action.payload.summary;
        });
        builder.addCase(refreshWorkspace.fulfilled, (state, action) => {
            if (!action.payload || action.payload.workspace.id !== state.currentWorkspace?.id) return;
            state.currentWorkspace = action.payload.workspace;
            state.projects = action.payload.projects;
            state.summary = action.payload.summary;
        });
    },
});

export default workspaceSlice.reducer;
