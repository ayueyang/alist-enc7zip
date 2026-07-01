<template>
  <div class="navbar rowBC reset-el-dropdown">
    <div class="rowSC">
      <!--  切换sidebar按钮  -->
      <hamburger v-if="settings.showHamburger" :is-active="sidebar.opened" class="hamburger-container" @toggleClick="toggleSideBar" />
      <!--  面包屑导航  -->
      <breadcrumb class="breadcrumb-container" />
    </div>
    <!--中间 logo，点击回代理页-->
    <a class="navbar-center-logo" href="/" title="返回代理页">
      <img class="center-logo" src="/public/logo.png" alt="代理页" />
    </a>
    <!-- 主题切换 + 下拉操作菜单 -->
    <div v-if="settings.ShowDropDown" class="right-menu rowSC">
      <el-tooltip :content="isDark ? '切换浅色模式' : '切换暗色模式'" placement="bottom">
        <el-icon class="theme-toggle" @click="toggleTheme">
          <Sunny v-if="isDark" />
          <Moon v-else />
        </el-icon>
      </el-tooltip>
      <el-dropdown trigger="click" size="medium">
        <div class="avatar-wrapper">
          <div style="float: left;margin-top: 18px;">
            <div> {{ userInfo.username }}</div>
            <div style="font-size: 12px;"> v.{{ userInfo.version }}</div>
          </div>
          <!-- <div>  {{ userInfo.version }}  </div> -->
          <CaretBottom style="width: 1em; height: 1em; margin-left: 4px" />
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <router-link to="/">
              <el-dropdown-item>{{ langTitle('Home') }}</el-dropdown-item>
            </router-link>
            <a target="_blank" href="https://github.com/ayueyang/alist-enc7zip">
              <el-dropdown-item>{{ langTitle('Github') }}</el-dropdown-item>
            </a>
            <a target="_blank" href="https://github.com/ayueyang/alist-encrypt">
              <el-dropdown-item>原版 Github</el-dropdown-item>
            </a>
            <!--<el-dropdown-item>修改密码</el-dropdown-item>-->
            <el-dropdown-item divided @click="loginOut">{{ langTitle('login out') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, computed } from 'vue'
import { CaretBottom, Sunny, Moon } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import Breadcrumb from './Breadcrumb.vue'
import Hamburger from './Hamburger.vue'
import { resetState } from '@/hooks/use-permission'
import { elMessage } from '@/hooks/use-element'
import { useBasicStore } from '@/store/basic'
import { langTitle } from '@/hooks/use-common'

const basicStore = useBasicStore()
const { settings, sidebar, setToggleSideBar, userInfo } = basicStore
const toggleSideBar = () => {
  setToggleSideBar()
}

// 通过 DOM class 判断暗色模式，避免循环依赖：config -> router -> Layout -> Navbar
const isDark = computed(() => document.documentElement.classList.contains('dark'))
const toggleTheme = () => {
  const html = document.documentElement
  if (html.classList.contains('dark')) {
    html.className = 'lighting-theme'
  } else {
    html.className = 'dark'
  }
  // 持久化到 localStorage
  try {
    const piniaState = JSON.parse(localStorage.getItem('config') || '{}')
    piniaState.theme = html.className
    localStorage.setItem('config', JSON.stringify(piniaState))
  } catch (e) {}
}
//退出登录
const router = useRouter()
const loginOut = () => {
  elMessage('退出登录成功')
  router.push(`/login?redirect=/`)
  nextTick(() => {
    resetState()
  })
}
</script>

<style lang="scss" scoped>
.navbar {
  height: var(--nav-bar-height);
  overflow: hidden;
  position: relative;
  background: var(--nav-bar-background);
  box-shadow: var(--nav-bar-box-shadow);
  z-index: 1;
}

.navbar-center-logo {
  display: flex;
  align-items: center;
  text-decoration: none;
}

.center-logo {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: contain;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.85;
  }
}

//用户名 + 下拉箭号
.avatar-wrapper {
  margin-top: 5px;
  position: relative;
  cursor: pointer;

  .el-icon-caret-bottom {
    cursor: pointer;
    position: absolute;
    right: -20px;
    top: 25px;
    font-size: 12px;
  }
}

//center-title
.heardCenterTitle {
  text-align: center;
  position: absolute;
  top: 50%;
  left: 46%;
  font-weight: 600;
  font-size: 20px;
  transform: translate(-50%, -50%);
}

//drop-down
.right-menu {
  cursor: pointer;
  margin-right: 40px;
  background-color: var(--nav-bar-right-menu-background);
}

.theme-toggle {
  font-size: 20px;
  cursor: pointer;
  margin-right: 16px;
  color: var(--el-text-color-primary, #303133);
  transition: color 0.2s;

  &:hover {
    color: var(--el-color-primary);
  }
}
</style>
