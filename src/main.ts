import './styles.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { installBattlefields } from './battlefields';

mount(App, { target: document.getElementById('app')! });
installBattlefields(document.getElementById('app')!);
