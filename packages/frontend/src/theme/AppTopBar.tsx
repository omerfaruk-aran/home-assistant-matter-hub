import AccountTreeIcon from "@mui/icons-material/AccountTree";
import BugReportIcon from "@mui/icons-material/BugReport";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DevicesIcon from "@mui/icons-material/Devices";
import HubIcon from "@mui/icons-material/Hub";
import LabelIcon from "@mui/icons-material/Label";
import LightModeIcon from "@mui/icons-material/LightMode";
import LockIcon from "@mui/icons-material/Lock";
import MenuIcon from "@mui/icons-material/Menu";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import { useColorScheme } from "@mui/material/styles";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import useMediaQuery from "@mui/material/useMediaQuery";
import { type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router";
import { LogViewer } from "../components/logs/LogViewer.tsx";
import { StatusIndicator } from "../components/status/StatusIndicator.tsx";
import { navigation } from "../routes.tsx";
import { AppLogo } from "./AppLogo.tsx";

interface NavItem {
  label: string;
  icon: ReactNode;
  to?: string;
  onClick?: () => void;
}

export const AppTopBar = () => {
  const isLargeScreen = useMediaQuery("(min-width:600px)");
  const { mode, setMode } = useColorScheme();
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  const toggleColorMode = () => {
    setMode(mode === "dark" ? "light" : "dark");
  };

  const navItems: NavItem[] = [
    { label: "Bridges", icon: <HubIcon />, to: navigation.bridges },
    { label: "All Devices", icon: <DevicesIcon />, to: navigation.devices },
    {
      label: "Network Map",
      icon: <AccountTreeIcon />,
      to: navigation.networkMap,
    },
    {
      label: "Startup Order",
      icon: <RocketLaunchIcon />,
      to: navigation.startup,
    },
    {
      label: "Lock Credentials",
      icon: <LockIcon />,
      to: navigation.lockCredentials,
    },
    { label: "Labels & Areas", icon: <LabelIcon />, to: navigation.labels },
    {
      label: mode === "dark" ? "Light Mode" : "Dark Mode",
      icon: mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />,
      onClick: toggleColorMode,
    },
    {
      label: "System Logs",
      icon: <BugReportIcon />,
      onClick: () => setLogViewerOpen(true),
    },
    {
      label: "Health Dashboard",
      icon: <MonitorHeartIcon />,
      to: navigation.health,
    },
  ];

  const handleDrawerItemClick = (item: NavItem) => {
    setDrawerOpen(false);
    if (item.onClick) {
      item.onClick();
    } else if (item.to) {
      navigate(item.to);
    }
  };

  return (
    <Box>
      <AppBar sx={{ height: "72px" }}>
        <Toolbar
          sx={{ paddingLeft: "0 !important", paddingRight: "0 !important" }}
        >
          <Container
            sx={{
              padding: 2,
              height: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <AppLogo large={isLargeScreen} />
            {isLargeScreen ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {navItems.map((item) =>
                  item.to ? (
                    <Tooltip title={item.label} key={item.label}>
                      <IconButton
                        component={Link}
                        to={item.to}
                        sx={{ color: "inherit" }}
                      >
                        {item.icon}
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title={item.label} key={item.label}>
                      <IconButton
                        onClick={item.onClick}
                        sx={{ color: "inherit" }}
                      >
                        {item.icon}
                      </IconButton>
                    </Tooltip>
                  ),
                )}
                <StatusIndicator />
              </Box>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <StatusIndicator />
                <IconButton
                  onClick={() => setDrawerOpen(true)}
                  sx={{ color: "inherit" }}
                >
                  <MenuIcon />
                </IconButton>
              </Box>
            )}
          </Container>
        </Toolbar>
      </AppBar>
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        <List sx={{ width: 250 }}>
          {navItems.map((item) => (
            <ListItemButton
              key={item.label}
              onClick={() => handleDrawerItemClick(item)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <LogViewer open={logViewerOpen} onClose={() => setLogViewerOpen(false)} />
    </Box>
  );
};
