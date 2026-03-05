import React, { useEffect, useMemo, useState } from 'react';
import { format, parse, parseISO, isValid, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

const DATE_DISPLAY_FORMAT = 'dd/MM/yyyy';
const DATE_VALUE_FORMAT = 'yyyy-MM-dd';
const MONTH_DISPLAY_FORMAT = 'MM/yyyy';
const MONTH_VALUE_FORMAT = 'yyyy-MM';

const parseDateValue = (value, displayFormat) => {
    if (!value) return null;
    const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const displayMatch = /^\d{2}\/\d{2}\/\d{4}$/.test(value);

    if (isoMatch) {
        const parsed = parseISO(value);
        return isValid(parsed) ? parsed : null;
    }

    if (displayMatch) {
        const parsed = parse(value, DATE_DISPLAY_FORMAT, new Date());
        return isValid(parsed) ? parsed : null;
    }

    if (displayFormat) {
        const parsed = parse(value, displayFormat, new Date());
        return isValid(parsed) ? parsed : null;
    }

    return null;
};

const parseMonthValue = (value) => {
    if (!value) return null;
    const isoMatch = /^\d{4}-\d{2}$/.test(value);
    const displayMatch = /^\d{2}\/\d{4}$/.test(value);

    if (isoMatch) {
        const parsed = parse(value + '-01', 'yyyy-MM-dd', new Date());
        return isValid(parsed) ? parsed : null;
    }

    if (displayMatch) {
        const parsed = parse(value, MONTH_DISPLAY_FORMAT, new Date());
        return isValid(parsed) ? parsed : null;
    }

    return null;
};

const formatDateValue = (date) => (date ? format(date, DATE_VALUE_FORMAT) : '');
const formatDateDisplay = (date) => (date ? format(date, DATE_DISPLAY_FORMAT) : '');
const formatMonthValue = (date) => (date ? format(date, MONTH_VALUE_FORMAT) : '');
const formatMonthDisplay = (date) => (date ? format(date, MONTH_DISPLAY_FORMAT) : '');

const DateInputWithCalendar = ({
    value,
    onChange,
    placeholder = 'dd/mm/aaaa',
    disabled,
    id,
    name,
    className,
    min,
    max,
    ...rest
}) => {
    const [displayValue, setDisplayValue] = useState('');
    const selectedDate = useMemo(() => parseDateValue(value), [value]);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [displayMonth, setDisplayMonth] = useState(() => selectedDate || new Date());
    const [yearInput, setYearInput] = useState(() => String((selectedDate || new Date()).getFullYear()));

    useEffect(() => {
        if (!value) {
            setDisplayValue('');
            return;
        }
        const parsed = parseDateValue(value);
        setDisplayValue(parsed ? formatDateDisplay(parsed) : value);
    }, [value]);

    useEffect(() => {
        if (!selectedDate) return;
        setDisplayMonth(selectedDate);
        setYearInput(String(selectedDate.getFullYear()));
    }, [selectedDate]);

    const formatDateAsUserTypes = (input) => {
        const digits = input.replace(/\D/g, '');
        if (digits.length === 0) return '';
        const d = digits.slice(0, 2);
        const m = digits.slice(2, 4);
        const y = digits.slice(4, 8);
        let out = d.length >= 2 ? d.padStart(2, '0') : d;
        if (digits.length > 2) out += '/' + (m.length >= 2 ? m.padStart(2, '0') : m);
        if (digits.length > 4) out += '/' + y;
        return out;
    };

    const handleInputChange = (event) => {
        const input = event.target.value;
        const formatted = formatDateAsUserTypes(input);
        setDisplayValue(formatted);

        if (!onChange) return;
        if (formatted.trim() === '') {
            onChange('');
            return;
        }

        const parsed = parseDateValue(formatted);
        if (parsed) {
            onChange(formatDateValue(parsed));
            setDisplayMonth(parsed);
            setYearInput(String(parsed.getFullYear()));
        }
    };

    const handleSelect = (date) => {
        if (!date) return;
        const formatted = formatDateValue(date);
        setDisplayValue(formatDateDisplay(date));
        setDisplayMonth(date);
        setYearInput(String(date.getFullYear()));
        onChange?.(formatted);
    };

    const minDate = useMemo(() => parseDateValue(min), [min]);
    const maxDate = useMemo(() => parseDateValue(max), [max]);
    const minYear = minDate?.getFullYear() ?? 1900;
    const maxYear = maxDate?.getFullYear() ?? new Date().getFullYear() + 120;

    const applyYearInput = (raw) => {
        const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
        setYearInput(digits);
        if (digits.length < 4) return;
        const parsedYear = Number(digits);
        if (!Number.isFinite(parsedYear)) return;
        const clampedYear = Math.min(maxYear, Math.max(minYear, parsedYear));
        const baseDate = selectedDate || displayMonth || new Date();
        setDisplayMonth(new Date(clampedYear, baseDate.getMonth(), 1));
    };

    const goPrevMonth = () => {
        const nextMonth = addMonths(displayMonth, -1);
        setDisplayMonth(nextMonth);
        setYearInput(String(nextMonth.getFullYear()));
    };

    const goNextMonth = () => {
        const nextMonth = addMonths(displayMonth, 1);
        setDisplayMonth(nextMonth);
        setYearInput(String(nextMonth.getFullYear()));
    };

    return (
        <div className="relative flex items-center gap-2">
            <Input
                id={id}
                name={name}
                value={displayValue}
                onChange={handleInputChange}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
                inputMode="numeric"
                min={min}
                max={max}
                {...rest}
            />
            <Popover
                modal={true}
                open={calendarOpen}
                onOpenChange={(open) => {
                    setCalendarOpen(open);
                    if (open) {
                        const baseDate = selectedDate || parseDateValue(displayValue) || new Date();
                        setDisplayMonth(baseDate);
                        setYearInput(String(baseDate.getFullYear()));
                    }
                }}
            >
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        disabled={disabled}
                    >
                        <CalendarDays className="h-4 w-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 z-[100]" align="end" style={{ pointerEvents: 'auto' }}>
                    <div className="flex items-center justify-between border-b px-3 py-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={goPrevMonth}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-1 text-sm">
                            <span className="capitalize">{format(displayMonth, 'MMMM', { locale: ptBR })}</span>
                            <Input
                                value={yearInput}
                                onChange={(e) => applyYearInput(e.target.value)}
                                className="h-7 w-20 text-center font-medium"
                                inputMode="numeric"
                                placeholder="AAAA"
                                onFocus={(e) => e.target.select()}
                            />
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={goNextMonth}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <Calendar
                        mode="single"
                        selected={selectedDate || undefined}
                        onSelect={handleSelect}
                        month={displayMonth}
                        onMonthChange={(month) => {
                            setDisplayMonth(month);
                            setYearInput(String(month.getFullYear()));
                        }}
                        classNames={{
                            caption: 'hidden'
                        }}
                        locale={ptBR}
                        fromDate={minDate || undefined}
                        toDate={maxDate || undefined}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
};

const MonthInputWithCalendar = ({
    value,
    onChange,
    placeholder = 'mm/aaaa',
    disabled,
    id,
    name,
    className,
    ...rest
}) => {
    const [displayValue, setDisplayValue] = useState('');
    const selectedDate = useMemo(() => parseMonthValue(value), [value]);

    useEffect(() => {
        if (!value) {
            setDisplayValue('');
            return;
        }
        const parsed = parseMonthValue(value);
        setDisplayValue(parsed ? formatMonthDisplay(parsed) : value);
    }, [value]);

    const handleInputChange = (event) => {
        const nextValue = event.target.value;
        setDisplayValue(nextValue);

        if (!onChange) return;
        if (nextValue.trim() === '') {
            onChange('');
            return;
        }

        const parsed = parseMonthValue(nextValue);
        if (parsed) {
            onChange(formatMonthValue(parsed));
        }
    };

    const handleSelect = (date) => {
        if (!date) return;
        const formatted = formatMonthValue(date);
        setDisplayValue(formatMonthDisplay(date));
        onChange?.(formatted);
    };

    return (
        <div className="relative flex items-center gap-2">
            <Input
                id={id}
                name={name}
                value={displayValue}
                onChange={handleInputChange}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
                inputMode="numeric"
                {...rest}
            />
            <Popover modal={true}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        disabled={disabled}
                    >
                        <CalendarDays className="h-4 w-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 z-[100]" align="end" style={{ pointerEvents: 'auto' }}>
                    <Calendar
                        mode="single"
                        selected={selectedDate || undefined}
                        onSelect={handleSelect}
                        locale={ptBR}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
};

const TimeInput = ({ value, onChange, placeholder = 'hh:mm', disabled, id, name, className, ...rest }) => (
    <Input
        id={id}
        name={name}
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        inputMode="numeric"
        {...rest}
    />
);

export { DateInputWithCalendar, MonthInputWithCalendar, TimeInput };
