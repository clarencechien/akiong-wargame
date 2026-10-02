import { render } from 'preact';
import { App } from './ui/app.tsx';
import './ui/theme.css';

render(<App />, document.getElementById('app')!);
